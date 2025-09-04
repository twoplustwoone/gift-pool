import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from '@remix-run/node';
import { Form, Link, useLoaderData } from '@remix-run/react';
import { Avatar } from '#app/components/ui/avatar.tsx';
import { Button } from '#app/components/ui/button.tsx';
import { Heading } from '#app/components/ui/heading.tsx';
import { SectionTitle } from '#app/components/ui/sectionTitle.tsx';
import { prisma } from '#app/utils/db.server.ts';
import { lockGiftPlan, requireUserIdInGroup, unlockGiftPlan } from '#app/utils/groups.server.ts';

export async function loader({ params, request }: LoaderFunctionArgs) {
  const groupId = params.giftGroupId!;
  const planId = params.planId!;
  await requireUserIdInGroup(request, groupId);

  const plan = await prisma.giftPlan.findUnique({
    where: { id: planId },
    select: {
      id: true,
      status: true,
      birthdayDate: true,
      lockedAt: true,
      lockedBy: { select: { username: true } },
      budgetSnapshot: true,
      recipient: { select: { id: true, username: true, name: true, image: { select: { id: true, altText: true } } } },
      giftGroupId: true,
      giftGroup: { select: { id: true, name: true } },
    },
  });
  if (!plan || plan.giftGroupId !== groupId) throw new Response('Not found', { status: 404 });
  return json({ plan });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get('intent');
  const groupId = params.giftGroupId!;
  const planId = params.planId!;
  if (intent === 'lock') {
    await lockGiftPlan(request, groupId, planId);
  } else if (intent === 'unlock') {
    const reason = String(formData.get('reason') || '');
    await unlockGiftPlan(request, groupId, planId, reason);
  }
  return json({ ok: true });
}

export default function GiftPlanRoute() {
  const { plan } = useLoaderData<typeof loader>();
  const locked = plan.status === 'LOCKED';
  const snapshot = plan.budgetSnapshot ? JSON.parse(plan.budgetSnapshot) as Array<{ userId: string; contributionCents: number }> : null;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <SectionTitle>
        <Heading>Gift Plan — {plan.recipient.username}</Heading>
        <Button asChild>
          <Link to={`/groups/${plan.giftGroup.id}`}>Back to Group</Link>
        </Button>
      </SectionTitle>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-4 flex items-center gap-3">
          <Avatar user={plan.recipient} image={plan.recipient.image} size="s" />
          <div className="text-sm text-muted-foreground">Birthday {new Date(plan.birthdayDate).toLocaleDateString()}</div>
          <div className={`ml-auto rounded px-2 py-0.5 text-xs ${locked ? 'bg-amber-200 text-amber-900' : 'bg-emerald-200 text-emerald-900'}`}>
            {plan.status}
          </div>
        </div>
        {locked ? (
          <div className="space-y-2">
            <div className="text-sm">Locked by {plan.lockedBy?.username} at {new Date(plan.lockedAt!).toLocaleString()}</div>
            <div>
              <h3 className="font-semibold">Budget Snapshot</h3>
              <ul className="text-sm">
                {snapshot?.map((s) => (
                  <li key={s.userId}>User {s.userId}: ${(s.contributionCents / 100).toFixed(2)}</li>
                ))}
              </ul>
            </div>
            <Form method="post" className="mt-2 flex items-center gap-2">
              <input type="hidden" name="intent" value="unlock" />
              <input name="reason" className="rounded border p-2" placeholder="Reason to unlock" />
              <Button variant="secondary">Unlock</Button>
            </Form>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-sm">Plan is editable. Locking will snapshot current budgets.</div>
            <Form method="post">
              <input type="hidden" name="intent" value="lock" />
              <Button>Lock Budget</Button>
            </Form>
          </div>
        )}
      </div>
    </div>
  );
}

