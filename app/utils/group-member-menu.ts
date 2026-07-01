import { type GroupRole } from './group-role.ts';

/**
 * Manager actions that can appear in a member row's three-dot menu.
 * Mirrors the server-side hierarchy enforced in `groups.server.ts`
 * (owner > admin > member; you can only act on people below you).
 */
export type MemberMenuAction = 'promote' | 'demote' | 'remove';

/**
 * Which manager actions the viewer may take on a given member row.
 *
 * Source of truth is the server (`removeMember` rejects admin→admin/owner;
 * `promoteToAdmin` / `demoteAdminToMember` require OWNER). This function must
 * stay stricter-than-or-equal-to that enforcement so the UI never offers an
 * action the server will 403.
 *
 * Rules:
 *  - Your own row: nothing.
 *  - A member viewing: nothing (non-managers see no menu).
 *  - An admin viewing: may remove MEMBERS only.
 *  - The owner viewing: promote+remove on member rows, demote+remove on admin
 *    rows. (Transfer-ownership is intentionally not surfaced here.)
 *  - Nobody can act on the OWNER row.
 */
export function memberMenuActions(
  viewerRole: GroupRole,
  targetRole: GroupRole,
  isViewer: boolean,
): MemberMenuAction[] {
  if (isViewer) return [];
  if (targetRole === 'OWNER') return [];

  if (viewerRole === 'OWNER') {
    if (targetRole === 'ADMIN') return ['demote', 'remove'];
    return ['promote', 'remove'];
  }

  if (viewerRole === 'ADMIN') {
    return targetRole === 'MEMBER' ? ['remove'] : [];
  }

  return [];
}
