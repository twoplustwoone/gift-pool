import { prisma } from '#app/utils/db.server.ts';
import {
  createPassword,
  createUser,
  expect,
  singleFetchActionBody,
  test,
} from '#tests/playwright-utils.ts';

async function createGroupWithOwnerAndMember({
  ownerContributionCents = 1000,
}: {
  ownerContributionCents?: number;
} = {}) {
  const ownerData = createUser();
  const memberData = createUser();

  const [owner, member] = await Promise.all([
    prisma.user.create({
      select: { id: true, username: true },
      data: {
        ...ownerData,
        roles: { connect: { name: 'user' } },
        password: { create: createPassword(ownerData.username) },
      },
    }),
    prisma.user.create({
      select: { id: true, username: true },
      data: {
        ...memberData,
        roles: { connect: { name: 'user' } },
        password: { create: createPassword(memberData.username) },
      },
    }),
  ]);

  const group = await prisma.giftGroup.create({
    select: { id: true },
    data: {
      name: `Optimistic ${Date.now()}`,
      description: 'E2E optimistic update test group',
      groupMembers: {
        create: [
          {
            userId: owner.id,
            role: 'OWNER',
            contributionCents: ownerContributionCents,
          },
          {
            userId: member.id,
            role: 'MEMBER',
            contributionCents: 500,
          },
        ],
      },
    },
  });

  return { groupId: group.id, owner, member };
}

test('members page shows optimistic role change before promote request resolves', async ({
  page,
  login,
}) => {
  const { groupId, owner, member } = await createGroupWithOwnerAndMember();
  let resolvePromoteGate = () => {};
  const promoteGate = new Promise<void>((resolve) => {
    resolvePromoteGate = resolve;
  });

  try {
    await login({ id: owner.id });

    await page.route(`**/groups/${groupId}/settings*`, async (route) => {
      const request = route.request();
      const isPromoteRequest =
        request.method() === 'POST' &&
        request.postData()?.includes('intent=member-promote-admin') &&
        request.postData()?.includes(`memberUserId=${member.id}`);

      if (isPromoteRequest) {
        await promoteGate;
      }

      await route.continue();
    });

    await page.goto(`/groups/${groupId}/members`);

    const memberRow = page.getByRole('listitem').filter({ hasText: member.username }).first();
    const promoteButton = memberRow.getByRole('button', {
      name: /promote to admin/i,
    });
    const demoteButton = memberRow.getByRole('button', {
      name: /demote to member/i,
    });

    await expect(promoteButton).toBeVisible();
    await promoteButton.click();

    await expect(demoteButton).toBeVisible();

    resolvePromoteGate();
    await expect(demoteButton).toBeVisible();
  } finally {
    await prisma.giftGroup.delete({ where: { id: groupId } }).catch(() => {});
    await prisma.user
      .deleteMany({ where: { id: { in: [owner.id, member.id] } } })
      .catch(() => {});
  }
});

test('overview budget rolls back after forced settings failure', async ({
  page,
  login,
}) => {
  const { groupId, owner, member } = await createGroupWithOwnerAndMember({
    ownerContributionCents: 1000,
  });

  try {
    await login({ id: owner.id });

    await page.route(`**/groups/${groupId}/settings*`, async (route) => {
      const request = route.request();
      const isBudgetUpdate =
        request.method() === 'POST' &&
        request.postData()?.includes('intent=member-update-self');
      if (!isBudgetUpdate) {
        await route.continue();
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 600));
      const { body, contentType } = await singleFetchActionBody({
        ok: false,
        error: 'forced budget failure',
      });
      await route.fulfill({ status: 200, contentType, body });
    });

    await page.goto(`/groups/${groupId}`);

    const budgetResponsePromise = page.waitForResponse((response) => {
      return (
        response.url().includes(`/groups/${groupId}/settings`) &&
        response.request().method() === 'POST'
      );
    });

    await page.getByRole('button', { name: /edit your budget/i }).click();
    const budgetInput = page.getByLabel('Your budget');
    await budgetInput.fill('25');
    await page.getByRole('button', { name: /^save$/i }).click();

    const budgetAmount = page.getByTestId('budget-amount');
    await expect(budgetAmount).toHaveText('$25.00');
    await budgetResponsePromise;
    await expect(budgetAmount).toHaveText('$10.00');
  } finally {
    await prisma.giftGroup.delete({ where: { id: groupId } }).catch(() => {});
    await prisma.user
      .deleteMany({ where: { id: { in: [owner.id, member.id] } } })
      .catch(() => {});
  }
});
