import { describe, expect, it } from 'vitest';
import { memberMenuActions } from './group-member-menu.ts';

describe('memberMenuActions — group member permission matrix', () => {
  it('never offers actions on your own row', () => {
    expect(memberMenuActions('OWNER', 'OWNER', true)).toEqual([]);
    expect(memberMenuActions('ADMIN', 'ADMIN', true)).toEqual([]);
    expect(memberMenuActions('MEMBER', 'MEMBER', true)).toEqual([]);
  });

  it('never offers actions on the owner row', () => {
    expect(memberMenuActions('OWNER', 'OWNER', false)).toEqual([]);
    expect(memberMenuActions('ADMIN', 'OWNER', false)).toEqual([]);
    expect(memberMenuActions('MEMBER', 'OWNER', false)).toEqual([]);
  });

  it('shows nothing to a member viewer on any row', () => {
    expect(memberMenuActions('MEMBER', 'ADMIN', false)).toEqual([]);
    expect(memberMenuActions('MEMBER', 'MEMBER', false)).toEqual([]);
  });

  it('lets an admin remove members only', () => {
    expect(memberMenuActions('ADMIN', 'MEMBER', false)).toEqual(['remove']);
    // Admins cannot act on other admins (matches server 403).
    expect(memberMenuActions('ADMIN', 'ADMIN', false)).toEqual([]);
  });

  it('lets the owner promote+remove members and demote+remove admins', () => {
    expect(memberMenuActions('OWNER', 'MEMBER', false)).toEqual([
      'promote',
      'remove',
    ]);
    expect(memberMenuActions('OWNER', 'ADMIN', false)).toEqual([
      'demote',
      'remove',
    ]);
  });
});
