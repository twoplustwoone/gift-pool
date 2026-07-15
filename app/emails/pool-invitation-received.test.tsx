/**
 * @vitest-environment node
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PoolInvitationReceivedEmail } from './pool-invitation-received.tsx';

describe('PoolInvitationReceivedEmail', () => {
  it('renders invitation context and both destination links', () => {
    const html = renderToStaticMarkup(
      <PoolInvitationReceivedEmail
        appName="Gift Pool"
        inviterDisplayName="Wade"
        poolTitle="Birthday surprise"
        recipientLabel="Alex"
        invitationUrl="https://giftpool.app/pools/invitations/invitation-1"
        managePreferencesUrl="https://giftpool.app/settings/profile/notifications"
      />,
    );

    expect(html).toContain('Wade invited you to a gift pool');
    expect(html).toContain('This gift pool is for Alex');
    expect(html).toContain(
      'href="https://giftpool.app/pools/invitations/invitation-1"',
    );
    expect(html).toContain(
      'href="https://giftpool.app/settings/profile/notifications"',
    );
  });
});
