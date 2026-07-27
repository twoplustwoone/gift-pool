/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  resolveClaimDisclosure,
  type ClaimHolder,
  type ViewerRelationship,
} from './wishlist-claim-disclosure.ts';

const VIEWER: ViewerRelationship = {
  isOwner: false,
  isAnonymous: false,
  viewerUserId: 'viewer-1',
  contributesToHolderPool: false,
  memberOfHolderGroup: false,
  sharesPoolWithHolderUser: false,
};
const viewer = (o: Partial<ViewerRelationship> = {}): ViewerRelationship => ({ ...VIEWER, ...o });

const POOL_HOLDER: ClaimHolder = {
  kind: 'pool',
  poolId: 'pool-1',
  poolTitle: "Dave's 40th",
  giftGroupId: 'group-1',
  giftGroupName: 'Sunday Roasters',
};
const USER_HOLDER: ClaimHolder = { kind: 'user', userId: 'sarah', displayName: 'Sarah' };

describe('resolveClaimDisclosure — the owner boundary', () => {
  it('shows nothing to the wishlist owner, whoever holds the claim', () => {
    for (const holder of [POOL_HOLDER, USER_HOLDER, null]) {
      const d = resolveClaimDisclosure(holder, viewer({ isOwner: true }), 'label');
      expect(d.show).toBe(false);
      expect(d.text).toBe('');
      expect(d.name).toBeNull();
    }
  });

  it('shows nothing when the item is unclaimed', () => {
    expect(resolveClaimDisclosure(null, viewer(), 'label').show).toBe(false);
  });
});

describe('resolveClaimDisclosure — pool-held claims, five tiers', () => {
  it('tier 2: a contributor of the holding pool sees the pool named, toned pool not warning', () => {
    const d = resolveClaimDisclosure(POOL_HOLDER, viewer({ contributesToHolderPool: true }), 'label');
    expect(d.show).toBe(true);
    expect(d.name).toBe("Dave's 40th");
    expect(d.text).toBe("Your pool Dave's 40th is getting this");
    expect(d.tone).toBe('pool');
    expect(d.poolLink).toBe('/pools/pool-1');
    expect(d.canJoinPool).toBe(false);
  });

  it('tier 3: a group member outside the pool sees the group named and can join', () => {
    const d = resolveClaimDisclosure(POOL_HOLDER, viewer({ memberOfHolderGroup: true }), 'label');
    expect(d.name).toBe('Sunday Roasters');
    expect(d.text).toBe('Sunday Roasters is getting this');
    expect(d.canJoinPool).toBe(true);
  });

  it('tier 4: any other signed-in viewer gets no attribution', () => {
    const d = resolveClaimDisclosure(POOL_HOLDER, viewer(), 'label');
    expect(d.show).toBe(true);
    expect(d.text).toBe('Already claimed');
    expect(d.name).toBeNull();
    expect(d.poolLink).toBeNull();
    expect(d.canJoinPool).toBe(false);
  });

  it('tier 5: an anonymous public-share visitor gets no attribution, even as a group member', () => {
    const d = resolveClaimDisclosure(
      POOL_HOLDER,
      viewer({ isAnonymous: true, viewerUserId: null, memberOfHolderGroup: true }),
      'label',
    );
    expect(d.text).toBe('Already claimed');
    expect(d.name).toBeNull();
  });

  it('never leaks the pool or group name into any tier-4 or tier-5 field', () => {
    for (const v of [viewer(), viewer({ isAnonymous: true, viewerUserId: null })]) {
      const d = resolveClaimDisclosure(POOL_HOLDER, v, 'label');
      const serialized = JSON.stringify(d);
      expect(serialized).not.toContain("Dave's 40th");
      expect(serialized).not.toContain('Sunday Roasters');
      expect(serialized).not.toContain('pool-1');
      expect(serialized).not.toContain('group-1');
    }
  });
});

describe('resolveClaimDisclosure — the badge surface', () => {
  it('names a solo claimer who shares this pool, and warns', () => {
    const d = resolveClaimDisclosure(USER_HOLDER, viewer({ sharesPoolWithHolderUser: true }), 'badge');
    expect(d.text).toBe('Claimed by Sarah');
    expect(d.tone).toBe('warning');
  });

  it('does not name a solo claimer outside this pool', () => {
    const d = resolveClaimDisclosure(USER_HOLDER, viewer(), 'badge');
    expect(d.text).toBe('Already claimed');
    expect(d.name).toBeNull();
    expect(d.tone).toBe('warning');
  });

  it('says another group without naming it', () => {
    const d = resolveClaimDisclosure(POOL_HOLDER, viewer(), 'badge');
    expect(d.text).toBe('Another group is getting this');
    expect(JSON.stringify(d)).not.toContain('Sunday Roasters');
  });
});

describe('resolveClaimDisclosure — the picker row surface', () => {
  it('withholds identity entirely, even from someone who could be told', () => {
    const d = resolveClaimDisclosure(USER_HOLDER, viewer({ sharesPoolWithHolderUser: true }), 'row');
    expect(d.text).toBe('Already claimed');
    expect(d.name).toBeNull();
  });
});
