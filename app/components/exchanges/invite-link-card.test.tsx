/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { InviteLinkCard } from './invite-link-card.tsx';

const url = 'https://giftpool.app/exchanges/join/9fk2painted';

describe('<InviteLinkCard />', () => {
  it('offers to make one when there is no link yet', async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();
    render(
      <InviteLinkCard
        inviteUrl={null}
        pending={false}
        onGenerate={onGenerate}
        onReplace={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('invite-link')).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Create an invite link' }),
    );
    expect(onGenerate).toHaveBeenCalled();
  });

  it('shows the link, and says what it does and when it stops', () => {
    render(
      <InviteLinkCard
        inviteUrl={url}
        pending={false}
        onGenerate={vi.fn()}
        onReplace={vi.fn()}
      />,
    );
    expect(screen.getByTestId('invite-link')).toHaveTextContent(url);
    expect(
      screen.getByText(/Anyone with this link can join until you draw/),
    ).toBeInTheDocument();
    expect(
      screen.getByText('The link stops working after the draw.'),
    ).toBeInTheDocument();
  });

  it('copies the link, and says so', async () => {
    // After userEvent.setup(): it installs its own clipboard stub, which
    // would otherwise replace this one.
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    render(
      <InviteLinkCard
        inviteUrl={url}
        pending={false}
        onGenerate={vi.fn()}
        onReplace={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith(url);
    expect(
      await screen.findByRole('button', { name: 'Copied' }),
    ).toBeInTheDocument();
  });

  it('explains that a new link is how you undo sharing the old one', async () => {
    const user = userEvent.setup();
    const onReplace = vi.fn();
    render(
      <InviteLinkCard
        inviteUrl={url}
        pending={false}
        onGenerate={vi.fn()}
        onReplace={onReplace}
      />,
    );
    expect(
      screen.getByText(/that's how you undo sending it to the wrong person/i),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New link' }));
    expect(onReplace).toHaveBeenCalled();
  });
});
