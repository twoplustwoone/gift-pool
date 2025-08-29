import { describe, test, expect } from 'vitest'
import { can, type Role } from './group'

describe('group policies', () => {
  const roles: Role[] = ['OWNER', 'ADMIN', 'MEMBER']

  test('deleteGroup allowed only for owner', () => {
    expect(can.deleteGroup('OWNER')).toBe(true)
    expect(can.deleteGroup('ADMIN')).toBe(false)
    expect(can.deleteGroup('MEMBER')).toBe(false)
  })

  test('transferOwnership allowed only for owner', () => {
    roles.forEach(role => {
      expect(can.transferOwnership(role)).toBe(role === 'OWNER')
    })
  })

  test('manageAdmins allowed only for owner', () => {
    roles.forEach(role => {
      expect(can.manageAdmins(role)).toBe(role === 'OWNER')
    })
  })

  test('removeMember allowed for owner and admin', () => {
    expect(can.removeMember('OWNER')).toBe(true)
    expect(can.removeMember('ADMIN')).toBe(true)
    expect(can.removeMember('MEMBER')).toBe(false)
  })

  test('manageInvites allowed for owner and admin', () => {
    expect(can.manageInvites('OWNER')).toBe(true)
    expect(can.manageInvites('ADMIN')).toBe(true)
    expect(can.manageInvites('MEMBER')).toBe(false)
  })

  test('manageSettings allowed for owner and admin', () => {
    expect(can.manageSettings('OWNER')).toBe(true)
    expect(can.manageSettings('ADMIN')).toBe(true)
    expect(can.manageSettings('MEMBER')).toBe(false)
  })

  test('changeReminders allowed for owner and admin', () => {
    expect(can.changeReminders('OWNER')).toBe(true)
    expect(can.changeReminders('ADMIN')).toBe(true)
    expect(can.changeReminders('MEMBER')).toBe(false)
  })

  describe('leaveGroup', () => {
    test('non-owner can leave', () => {
      expect(can.leaveGroup('MEMBER', false, false)).toBe(true)
      expect(can.leaveGroup('ADMIN', false, false)).toBe(true)
    })

    test('owner without backup cannot leave', () => {
      expect(can.leaveGroup('OWNER', true, false)).toBe(false)
    })

    test('owner with another admin/owner can leave', () => {
      expect(can.leaveGroup('OWNER', true, true)).toBe(true)
    })
  })

  describe('viewBudgetValue', () => {
    const visibilities = ['EVERYONE', 'ADMINS', 'ONLY_SELF'] as const

    test('self can always view', () => {
      visibilities.forEach(vis => {
        roles.forEach(role => {
          expect(can.viewBudgetValue(role, vis, true)).toBe(true)
        })
      })
    })

    test('ONLY_SELF hides from others', () => {
      roles.forEach(role => {
        expect(can.viewBudgetValue(role, 'ONLY_SELF', false)).toBe(false)
      })
    })

    test('ADMINS hides from members', () => {
      expect(can.viewBudgetValue('MEMBER', 'ADMINS', false)).toBe(false)
      expect(can.viewBudgetValue('ADMIN', 'ADMINS', false)).toBe(true)
      expect(can.viewBudgetValue('OWNER', 'ADMINS', false)).toBe(true)
    })

    test('EVERYONE allows all', () => {
      roles.forEach(role => {
        expect(can.viewBudgetValue(role, 'EVERYONE', false)).toBe(true)
      })
    })
  })
})
