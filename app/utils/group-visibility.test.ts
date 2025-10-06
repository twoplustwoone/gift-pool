import { describe, expect, it } from 'vitest';
import { isBudgetVisible } from './group-visibility';

describe('isBudgetVisible', () => {
  it('EVERYONE -> visible to all', () => {
    expect(
      isBudgetVisible({
        groupVisibility: 'EVERYONE',
        viewerRole: 'MEMBER',
        isSelf: false,
      }),
    ).toBe(true);
  });

  it('ADMINS -> visible to admins and self', () => {
    expect(
      isBudgetVisible({
        groupVisibility: 'ADMINS',
        viewerRole: 'ADMIN',
        isSelf: false,
      }),
    ).toBe(true);
    expect(
      isBudgetVisible({
        groupVisibility: 'ADMINS',
        viewerRole: 'MEMBER',
        isSelf: true,
      }),
    ).toBe(true);
    expect(
      isBudgetVisible({
        groupVisibility: 'ADMINS',
        viewerRole: 'MEMBER',
        isSelf: false,
      }),
    ).toBe(false);
  });

  it('ONLY_SELF -> visible only to self', () => {
    expect(
      isBudgetVisible({
        groupVisibility: 'ONLY_SELF',
        viewerRole: 'OWNER',
        isSelf: false,
      }),
    ).toBe(false);
    expect(
      isBudgetVisible({
        groupVisibility: 'ONLY_SELF',
        viewerRole: 'MEMBER',
        isSelf: true,
      }),
    ).toBe(true);
  });

  it('member override applies', () => {
    expect(
      isBudgetVisible({
        groupVisibility: 'EVERYONE',
        memberOverride: 'ONLY_SELF',
        viewerRole: 'ADMIN',
        isSelf: false,
      }),
    ).toBe(false);
  });
});
