// A plain JS entrypoint to ensure an admin user exists.
// Usage: NODE_ENV=production ADMIN_USERNAME=twoplustwoone node other/ensure-admin.js
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TARGET_USERNAME = process.env.ADMIN_USERNAME?.toLowerCase();

if (!TARGET_USERNAME) {
  console.log(
    'ADMIN_USERNAME environment variable is not set, skipping admin grant.',
  );
  process.exit(0);
}

async function main() {
  const adminRole = await prisma.role.upsert({
    where: { name: 'admin' },
    update: {},
    create: { name: 'admin', description: 'Admin role' },
  });

  const user = await prisma.user.findUnique({
    where: { username: TARGET_USERNAME },
    select: { id: true, roles: { select: { name: true } } },
  });

  if (!user) {
    console.error(`User "${TARGET_USERNAME}" not found; skipping admin grant.`);
    return;
  }

  if (user.roles.some((role) => role.name === adminRole.name)) {
    console.log(`User "${TARGET_USERNAME}" already has admin role.`);
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { roles: { connect: { name: adminRole.name } } },
  });

  console.log(`Granted admin role to "${TARGET_USERNAME}".`);
}

main()
  .catch((error) => {
    console.error('Failed to ensure admin user:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
