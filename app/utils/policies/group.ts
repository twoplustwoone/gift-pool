export type Role = 'OWNER' | 'ADMIN' | 'MEMBER'

export const can = {
  deleteGroup: (role: Role) => role === 'OWNER',
  transferOwnership: (role: Role) => role === 'OWNER',
  manageAdmins: (role: Role) => role === 'OWNER',
  removeMember: (role: Role) => role === 'OWNER' || role === 'ADMIN',
  manageInvites: (role: Role) => role === 'OWNER' || role === 'ADMIN',
  manageSettings: (role: Role) => role === 'OWNER' || role === 'ADMIN',
  changeReminders: (role: Role) => role === 'OWNER' || role === 'ADMIN',
  leaveGroup: (
    _role: Role,
    isOwner: boolean,
    hasOtherAdminsOrOwners: boolean,
  ) => {
    if (!isOwner) return true
    return hasOtherAdminsOrOwners
  },
  viewBudgetValue: (
    viewerRole: Role,
    groupVisibility: 'EVERYONE' | 'ADMINS' | 'ONLY_SELF',
    isSelf: boolean,
  ) => {
    if (isSelf) return true
    if (groupVisibility === 'ONLY_SELF') return false
    if (groupVisibility === 'ADMINS') return viewerRole !== 'MEMBER'
    return true
  },
}

export type Can = typeof can
