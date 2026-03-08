import { parseWithZod } from '@conform-to/zod';
import { type ActionFunctionArgs } from 'react-router';
import { data, redirect } from 'react-router';
import { z } from 'zod';
import { requireUserId } from '#app/utils/auth.server.ts';
import { prisma } from '#app/utils/db.server.ts';
import { GroupEditorSchema } from './__group-editor';
export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const submission = await parseWithZod(formData, {
    schema: GroupEditorSchema.superRefine(async (data, ctx) => {
      if (!data.id) return;
      const giftGroup = await prisma.giftGroup.findUnique({
        select: {
          id: true,
          groupMembers: {
            select: {
              userId: true,
              role: true,
            },
          },
        },
        where: {
          id: data.id,
          groupMembers: {
            some: {
              userId,
              OR: [
                {
                  role: 'OWNER',
                },
                {
                  role: 'ADMIN',
                },
              ],
            },
          },
        },
      });
      if (!giftGroup) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Gift Group not found',
        });
      }
    }),
    async: true,
  });
  if (submission.status !== 'success') {
    return data(submission.reply(), {
      status: submission.status === 'error' ? 400 : 200,
    });
  }
  if (!submission.value) {
    return data(submission.reply(), {
      status: 400,
    });
  }
  const { id: giftGroupId, name, description } = submission.value;
  const updatedGiftGroup = await prisma.giftGroup.upsert({
    select: {
      id: true,
      groupMembers: {
        select: {
          userId: true,
          role: true,
        },
      },
    },
    where: {
      id: giftGroupId ?? '__new_gift_group__',
    },
    create: {
      name,
      description,
      groupMembers: {
        create: {
          userId,
          role: 'OWNER',
        },
      },
    },
    update: {
      name,
      description,
    },
  });
  return redirect(`/groups/${updatedGiftGroup.id}`);
}
