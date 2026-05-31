import { parseWithZod } from '@conform-to/zod';
import { captureException } from '@sentry/react-router';
import { data, type ActionFunctionArgs } from 'react-router';
import { z } from 'zod';
import { FeedbackAcknowledgedEmail } from '#app/emails/feedback-acknowledged.tsx';
import { FeedbackReceivedEmail } from '#app/emails/feedback-received.tsx';
import { queueLogEvent } from '#app/utils/analytics.server.ts';
import { getUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { sendEmail } from '#app/utils/email.server.ts';
import {
  FeedbackSchema,
  type FeedbackType,
} from '#app/utils/feedback-validation.ts';
import { checkHoneypot } from '#app/utils/honeypot.server.ts';
import { getDomainUrl } from '#app/utils/misc.tsx';
import { getRequestContext } from '#app/utils/request-context.server.ts';

// Where operator notifications land. Mirrors the address the static support
// page used to point its mailto links at.
const FEEDBACK_INBOX = 'support@giftpool.app';

export async function action({ request }: ActionFunctionArgs) {
  const userId = await getUserId(request);
  const formData = await request.formData();
  await checkHoneypot(formData);

  const submission = await parseWithZod(formData, {
    schema: FeedbackSchema.superRefine((value, ctx) => {
      // Anonymous submitters must give us a way to reply.
      if (!userId && !value.email) {
        ctx.addIssue({
          path: ['email'],
          code: z.ZodIssueCode.custom,
          message: 'Please add an email so we can get back to you',
        });
      }
    }),
    async: true,
  });

  if (submission.status !== 'success') {
    return data(
      { result: submission.reply() },
      { status: submission.status === 'error' ? 400 : 200 },
    );
  }

  const { type, message, email, pageUrl } = submission.value;

  // Prefer the authenticated user's stored email; fall back to the typed one.
  const user = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, username: true, name: true },
      })
    : null;
  const contactEmail = user?.email ?? email ?? null;

  const feedback = await prisma.feedback.create({
    data: {
      type,
      message,
      email: contactEmail,
      userId: userId ?? null,
      pageUrl: pageUrl ?? null,
      userAgent: request.headers.get('user-agent'),
    },
    select: { id: true },
  });

  // Primary change is committed. Everything below is best-effort and must
  // never turn a successful submission into a 500 — fire without awaiting and
  // tail rejections to Sentry. (See "Side effects off the action response".)
  const { requestId } = await getRequestContext(request);
  queueLogEvent({
    name: 'feedback_submitted',
    userId: userId ?? null,
    source: 'server',
    requestId,
    properties: { type, anonymous: !userId, feedbackId: feedback.id },
  });

  const adminUrl = `${getDomainUrl(request)}/admin/feedback`;
  // CC a monitored inbox (e.g. a personal address) when configured, so
  // notifications reach someone even if support@ goes unwatched. Unset in
  // dev/test/CI, where it's simply omitted.
  const operatorCc = process.env.FEEDBACK_CC_EMAIL;
  void sendEmail({
    to: FEEDBACK_INBOX,
    ...(operatorCc ? { cc: operatorCc } : {}),
    subject: `[Feedback] ${type} from ${user?.username ?? contactEmail ?? 'anonymous'}`,
    react: (
      <FeedbackReceivedEmail
        type={type as FeedbackType}
        message={message}
        fromEmail={contactEmail ?? undefined}
        username={user?.username}
        pageUrl={pageUrl}
        adminUrl={adminUrl}
      />
    ),
  }).catch((error: unknown) => {
    captureException(error);
  });

  // Send a transactional acknowledgment back to the submitter when we know
  // their address. Fire-and-forget like the operator notification — a failure
  // here must never turn a successful submission into a 500.
  if (contactEmail) {
    void sendEmail({
      to: contactEmail,
      subject: 'We got your feedback — thanks!',
      react: (
        <FeedbackAcknowledgedEmail
          type={type as FeedbackType}
          message={message}
          recipientName={user?.name ?? user?.username ?? null}
        />
      ),
    }).catch((error: unknown) => {
      captureException(error);
    });
  }

  return data({ result: submission.reply({ resetForm: true }), ok: true });
}
