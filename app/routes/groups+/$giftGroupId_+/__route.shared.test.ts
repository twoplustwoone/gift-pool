/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  applyPendingSettingsMemberMutations,
  getPathname,
} from './__route.shared.ts';

type Member = {
  role: 'ADMIN' | 'MEMBER' | 'OWNER';
  user: {
    id: string;
  };
};

const members: Member[] = [
  { user: { id: 'owner-1' }, role: 'OWNER' },
  { user: { id: 'admin-1' }, role: 'ADMIN' },
  { user: { id: 'member-1' }, role: 'MEMBER' },
];

function createFormData(entries: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.set(key, value);
  }
  return formData;
}

describe('groups detail shared helpers', () => {
  it('normalizes absolute urls and preserves invalid actions', () => {
    expect(getPathname('https://giftpool.app/groups/group-1/settings')).toBe(
      '/groups/group-1/settings',
    );
    expect(getPathname('/groups/group-1/settings')).toBe(
      '/groups/group-1/settings',
    );
    expect(getPathname('not a url')).toBe('/not%20a%20url');
    expect(getPathname(undefined)).toBeNull();
  });

  it('applies member removal, promotion, and ownership transfer mutations in order', () => {
    const nextMembers = applyPendingSettingsMemberMutations({
      fetchers: [
        {
          formAction: 'https://giftpool.app/groups/group-1/settings',
          formData: createFormData({
            intent: 'member-remove',
            memberUserId: 'member-1',
          }),
          formMethod: 'post',
        },
        {
          formAction: '/groups/group-1/settings',
          formData: createFormData({
            intent: 'member-promote-admin',
            memberUserId: 'admin-1',
          }),
          formMethod: 'post',
        },
        {
          formAction: '/groups/group-1/settings',
          formData: createFormData({
            intent: 'ownership-transfer',
            newOwnerUserId: 'admin-1',
          }),
          formMethod: 'post',
        },
      ],
      getRole: (member) => member.role,
      getUserId: (member) => member.user.id,
      members,
      setRole: (member, role) => ({
        ...member,
        role,
      }),
      settingsAction: '/groups/group-1/settings',
    });

    expect(nextMembers).toEqual([
      { user: { id: 'owner-1' }, role: 'ADMIN' },
      { user: { id: 'admin-1' }, role: 'OWNER' },
    ]);
  });

  it('ignores fetchers that are not relevant settings mutations', () => {
    const nextMembers = applyPendingSettingsMemberMutations({
      fetchers: [
        {
          formAction: '/groups/group-1/settings',
          formData: createFormData({
            intent: 'member-demote-member',
          }),
          formMethod: 'post',
        },
        {
          formAction: '/groups/group-1/other',
          formData: createFormData({
            intent: 'member-remove',
            memberUserId: 'member-1',
          }),
          formMethod: 'post',
        },
        {
          formAction: '/groups/group-1/settings',
          formData: createFormData({
            intent: 'unknown-intent',
            memberUserId: 'member-1',
          }),
          formMethod: 'post',
        },
        {
          formAction: '/groups/group-1/settings',
          formData: createFormData({
            intent: 'member-remove',
            memberUserId: 'member-1',
          }),
          formMethod: 'get',
        },
      ],
      getRole: (member) => member.role,
      getUserId: (member) => member.user.id,
      members,
      setRole: (member, role) => ({
        ...member,
        role,
      }),
      settingsAction: '/groups/group-1/settings',
    });

    expect(nextMembers).toEqual(members);
  });
});
