import { type Page } from '@playwright/test';
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
  ownerUser = {},
  memberUser = {},
}: {
  ownerContributionCents?: number;
  ownerUser?: Partial<ReturnType<typeof createUser>> & {
    birthday?: Date | null;
  };
  memberUser?: Partial<ReturnType<typeof createUser>> & {
    birthday?: Date | null;
  };
} = {}) {
  const ownerData = { ...createUser(), ...ownerUser };
  const memberData = { ...createUser(), ...memberUser };

  const [owner, member] = await Promise.all([
    prisma.user.create({
      select: { id: true, username: true, name: true },
      data: {
        ...ownerData,
        roles: { connect: { name: 'user' } },
        password: { create: createPassword(ownerData.username) },
      },
    }),
    prisma.user.create({
      select: { id: true, username: true, name: true },
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

const assertNoHorizontalOverflow = async (page: Page) => {
  const metrics = await page.evaluate(() => {
    const documentElement = document.documentElement;
    const appScrollArea = document.querySelector(
      '[data-testid="app-scroll-area"]',
    ) as HTMLElement | null;

    return {
      documentScrollWidth: documentElement.scrollWidth,
      documentClientWidth: documentElement.clientWidth,
      appScrollWidth: appScrollArea?.scrollWidth ?? null,
      appClientWidth: appScrollArea?.clientWidth ?? null,
    };
  });

  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(
    metrics.documentClientWidth + 1,
  );
  expect(metrics.appScrollWidth).not.toBeNull();
  expect(metrics.appClientWidth).not.toBeNull();
  expect(metrics.appScrollWidth ?? 0).toBeLessThanOrEqual(
    (metrics.appClientWidth ?? 0) + 1,
  );
};

test('members page keeps long member rows within mobile viewport', async ({
  page,
  login,
}) => {
  const suffix = Date.now().toString(36).slice(-4);
  const longOwnerUsername = `mmmmmmmmmmmmmmm${suffix}o`;
  const longMemberUsername = `mmmmmmmmmmmmmmm${suffix}m`;
  const longOwnerDisplayName =
    'Olivia Longviewer With An Exceptionally Long Display Name';
  const longMemberDisplayName =
    'Francisco Di Giandomenico With An Exceptionally Long Display Name';
  const { groupId, owner, member } = await createGroupWithOwnerAndMember({
    ownerUser: {
      username: longOwnerUsername,
      name: longOwnerDisplayName,
      email: `${longOwnerUsername}@example.com`,
    },
    memberUser: {
      username: longMemberUsername,
      name: longMemberDisplayName,
      email: `${longMemberUsername}@example.com`,
      birthday: new Date('1992-05-26T12:00:00.000Z'),
    },
  });

  try {
    await login({ id: owner.id });

    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`/groups/${groupId}/members`);
      await page.waitForLoadState('networkidle');

      const memberRow = page
        .getByRole('listitem')
        .filter({ hasText: longMemberDisplayName })
        .first();
      await expect(memberRow).toBeVisible();
      await expect(memberRow.getByText(/^member$/).first()).toBeVisible();

      await assertNoHorizontalOverflow(page);

      if (width === 320) {
        const viewerRow = page
          .getByRole('listitem')
          .filter({ hasText: longOwnerDisplayName })
          .first();
        await expect(viewerRow.getByText(/^you$/)).toBeVisible();
        const nameMetrics = await viewerRow
          .getByTestId('member-display-name')
          .first()
          .evaluate((element) => {
            const styles = window.getComputedStyle(element);
            return {
              clientWidth: element.clientWidth,
              scrollWidth: element.scrollWidth,
              overflowX: styles.overflowX,
              textOverflow: styles.textOverflow,
              whiteSpace: styles.whiteSpace,
            };
          });

        expect(nameMetrics.scrollWidth).toBeGreaterThan(
          nameMetrics.clientWidth,
        );
        expect(nameMetrics.overflowX).toBe('hidden');
        expect(nameMetrics.textOverflow).toBe('ellipsis');
        expect(nameMetrics.whiteSpace).toBe('nowrap');
      }
    }

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/groups/${groupId}/members`);

    const desktopRow = page
      .getByRole('listitem')
      .filter({ hasText: longMemberDisplayName })
      .first();
    const usernameBox = await desktopRow
      .getByTestId('member-display-name')
      .first()
      .boundingBox();
    const roleBox = await desktopRow
      .getByText(/^member$/)
      .first()
      .boundingBox();

    expect(usernameBox).not.toBeNull();
    expect(roleBox).not.toBeNull();
    if (!usernameBox || !roleBox) {
      throw new Error('Expected desktop member row elements to be visible');
    }
    expect(
      Math.abs(
        usernameBox.y +
          usernameBox.height / 2 -
          (roleBox.y + roleBox.height / 2),
      ),
    ).toBeLessThan(16);
    await assertNoHorizontalOverflow(page);
  } finally {
    await prisma.giftGroup.delete({ where: { id: groupId } }).catch(() => {});
    await prisma.user
      .deleteMany({ where: { id: { in: [owner.id, member.id] } } })
      .catch(() => {});
  }
});

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

    const memberDisplay = member.name ?? member.username;
    const memberRow = page
      .getByRole('listitem')
      .filter({ hasText: memberDisplay })
      .first();

    // Open the row's three-dot menu (desktop dropdown) and choose Promote,
    // then confirm — the action only fires after the confirmation step.
    await memberRow.getByRole('button', { name: /actions for/i }).click();
    await page.getByRole('menuitem', { name: /promote to admin/i }).click();
    await page.getByRole('button', { name: 'Promote', exact: true }).click();

    // The role flips optimistically to admin before the gated POST resolves.
    const adminBadge = memberRow.getByText('admin', { exact: true });
    await expect(adminBadge).toBeVisible();

    resolvePromoteGate();
    await expect(adminBadge).toBeVisible();
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
