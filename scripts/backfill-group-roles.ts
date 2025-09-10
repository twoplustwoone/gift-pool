import { PrismaClient } from '@prisma/client'

// Backfill and repair group member roles to ensure:
// - Roles use allowed values only: OWNER | ADMIN | MEMBER (case-insensitive mapping)
// - Each active group has exactly one OWNER
//   - If none: promote earliest-joined ADMIN, else earliest-joined MEMBER
//   - If multiple: keep earliest-joined as OWNER, demote others to ADMIN

const prisma = new PrismaClient()

const ALLOWED = new Set(['OWNER', 'ADMIN', 'MEMBER'])

function normalizeRole(role: string | null | undefined):
  | 'OWNER'
  | 'ADMIN'
  | 'MEMBER'
  | null {
  if (!role) return null
  const r = role.trim().toUpperCase()
  if (ALLOWED.has(r)) return r as 'OWNER' | 'ADMIN' | 'MEMBER'
  // Legacy synonyms or typos you want to support
  if (r === 'CREATOR') return 'OWNER'
  return null
}

const APPLY = process.env.APPLY === '1' || process.env.APPLY === 'true'

async function setRole(
  userId: string,
  giftGroupId: string,
  role: 'OWNER' | 'ADMIN' | 'MEMBER',
) {
  if (!APPLY) return
  await prisma.usersInGiftGroups.update({
    where: { userId_giftGroupId: { userId, giftGroupId } },
    data: { role },
  })
}

async function main() {
  const groups = await prisma.giftGroup.findMany({
    select: {
      id: true,
      groupMembers: {
        select: {
          userId: true,
          role: true,
          joinedAt: true,
          removedAt: true,
        },
      },
    },
  })

  let normalized = 0
  let promoted = 0
  let demoted = 0
  let groupsFixed = 0

  for (const g of groups) {
    // 1) Normalize roles case/variants
    for (const m of g.groupMembers) {
      const norm = normalizeRole(m.role)
      if (norm && norm !== m.role) {
        if (APPLY) {
          await setRole(m.userId, g.id, norm)
        }
        normalized++
      }
    }

    // Consider only active members
    const active = g.groupMembers.filter((m) => m.removedAt == null)
    if (active.length === 0) continue

    const byJoined = (a: { joinedAt: Date }, b: { joinedAt: Date }) =>
      new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()

    const owners = active.filter((m) => normalizeRole(m.role) === 'OWNER')
    const admins = active.filter((m) => normalizeRole(m.role) === 'ADMIN')

    if (owners.length === 0) {
      // Promote earliest ADMIN, else earliest MEMBER
      const candidate = (admins.sort(byJoined)[0] ?? active.sort(byJoined)[0])!
      if (APPLY) await setRole(candidate.userId, g.id, 'OWNER')
      promoted++
      groupsFixed++
    } else if (owners.length > 1) {
      const sortedOwners = owners.slice().sort(byJoined)
      const keep = sortedOwners[0]
      const toDemote = sortedOwners.slice(1)
      for (const m of toDemote) {
        if (APPLY) await setRole(m.userId, g.id, 'ADMIN')
        demoted++
      }
      groupsFixed++
    }
  }

  console.log(
    JSON.stringify(
      { APPLY, normalized, promoted, demoted, groupsFixed, totalGroups: groups.length },
      null,
      2,
    ),
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

