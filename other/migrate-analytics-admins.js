// One-shot migration: convert the legacy ANALYTICS_ADMIN_USER_IDS /
// ANALYTICS_ADMIN_EMAILS env allowlists into real `admin` role connections.
//
// Run ONCE against prod BEFORE merging the commit that removes the env vars
// from env.server.ts, otherwise any reviewer who was on the allowlist without
// an admin role will lose access.
//
// Usage (prod):
//   fly ssh console --app <app>
//   node other/migrate-analytics-admins.js
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function parseAllowlist(value) {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function main() {
  const rawIds = parseAllowlist(process.env.ANALYTICS_ADMIN_USER_IDS);
  const rawEmails = parseAllowlist(process.env.ANALYTICS_ADMIN_EMAILS).map(
    (email) => email.toLowerCase(),
  );

  if (rawIds.length === 0 && rawEmails.length === 0) {
    console.log(
      'ANALYTICS_ADMIN_USER_IDS / ANALYTICS_ADMIN_EMAILS are empty. Nothing to migrate.',
    );
    return;
  }

  const adminRole = await prisma.role.upsert({
    where: { name: 'admin' },
    update: {},
    create: { name: 'admin', description: 'Admin role' },
  });

  const users = await prisma.user.findMany({
    where: {
      OR: [
        ...(rawIds.length ? [{ id: { in: rawIds } }] : []),
        ...(rawEmails.length ? [{ email: { in: rawEmails } }] : []),
      ],
    },
    select: {
      id: true,
      email: true,
      username: true,
      roles: { select: { name: true } },
    },
  });

  if (users.length === 0) {
    console.warn(
      'No users matched the allowlists. Check that the env vars still resolve to real accounts.',
    );
    return;
  }

  let granted = 0;
  let alreadyAdmin = 0;

  for (const user of users) {
    const hasAdmin = user.roles.some((role) => role.name === adminRole.name);
    if (hasAdmin) {
      alreadyAdmin++;
      console.log(
        `[skip] ${user.username} (${user.email}) already has admin role.`,
      );
      continue;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { roles: { connect: { name: adminRole.name } } },
    });
    granted++;
    console.log(`[grant] ${user.username} (${user.email}) → admin`);
  }

  console.log(
    `\nDone. Granted: ${granted}. Already admin: ${alreadyAdmin}. Matched: ${users.length}.`,
  );
  console.log(
    'It is now safe to deploy the commit that removes the ANALYTICS_ADMIN_* env vars from env.server.ts.',
  );
}

main()
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
