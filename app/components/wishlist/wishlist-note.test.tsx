/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockSubmit = vi.fn();

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useFetcher: () => ({
      state: 'idle',
      formData: undefined,
      submit: mockSubmit,
    }),
  };
});

vi.mock('#app/components/ui/icon.tsx', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

import { WishlistNote } from './wishlist-note';

describe('WishlistNote', () => {
  // ── Viewer ────────────────────────────────────────────────────────────────

  it('renders note text for a viewer when a note exists', () => {
    render(<WishlistNote note="Hello from the wishlist!" isOwner={false} />);
    expect(screen.getByText('Hello from the wishlist!')).toBeInTheDocument();
  });

  it('renders nothing for a viewer when note is null', () => {
    const { container } = render(<WishlistNote note={null} isOwner={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for a viewer when note is empty string', () => {
    const { container } = render(<WishlistNote note="" isOwner={false} />);
    expect(container.firstChild).toBeNull();
  });

  // ── Owner — no note ───────────────────────────────────────────────────────

  it('shows "Add a message" prompt for owner with no note', () => {
    render(<WishlistNote note={null} isOwner={true} />);
    expect(screen.getByText(/Add a message to your wishlist/i)).toBeInTheDocument();
  });

  it('shows "Add a message" prompt for owner with empty note', () => {
    render(<WishlistNote note="" isOwner={true} />);
    expect(screen.getByText(/Add a message to your wishlist/i)).toBeInTheDocument();
  });

  // ── Owner — existing note ─────────────────────────────────────────────────

  it('shows note text and edit button for owner with a note', () => {
    render(<WishlistNote note="Buy me coffee" isOwner={true} />);
    expect(screen.getByText('Buy me coffee')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Edit wishlist message/i }),
    ).toBeInTheDocument();
  });

  // ── Edit mode ─────────────────────────────────────────────────────────────

  it('enters edit mode when the edit button is clicked', () => {
    render(<WishlistNote note="Original note" isOwner={true} />);
    fireEvent.click(screen.getByRole('button', { name: /Edit wishlist message/i }));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      'Original note',
    );
  });

  it('enters edit mode from the "Add a message" prompt', () => {
    render(<WishlistNote note={null} isOwner={true} />);
    fireEvent.click(screen.getByText(/Add a message to your wishlist/i));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('cancel button exits edit mode without saving', () => {
    render(<WishlistNote note="Keep this" isOwner={true} />);
    fireEvent.click(screen.getByRole('button', { name: /Edit wishlist message/i }));
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('Keep this')).toBeInTheDocument();
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('save button submits the note and exits edit mode', () => {
    render(<WishlistNote note="Old note" isOwner={true} />);
    fireEvent.click(screen.getByRole('button', { name: /Edit wishlist message/i }));

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'New note' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));

    expect(mockSubmit).toHaveBeenCalledOnce();
    const [formData, options] = mockSubmit.mock.calls[0] as [FormData, { method: string; action: string }];
    expect(formData.get('intent')).toBe('update-note');
    expect(formData.get('note')).toBe('New note');
    expect(options.method).toBe('POST');
    expect(options.action).toBe('/wishlist');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows character counter when fewer than 50 chars remain', () => {
    render(<WishlistNote note={null} isOwner={true} />);
    fireEvent.click(screen.getByText(/Add a message to your wishlist/i));

    const textarea = screen.getByRole('textbox');
    // Type a string long enough to bring remaining chars under 50
    fireEvent.change(textarea, { target: { value: 'a'.repeat(355) } });

    // 400 - 355 = 45 chars left → counter should appear
    expect(screen.getByText('45 left')).toBeInTheDocument();
  });

  it('disables save when note exceeds max length', () => {
    render(<WishlistNote note={null} isOwner={true} />);
    fireEvent.click(screen.getByText(/Add a message to your wishlist/i));

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'a'.repeat(401) } });

    const saveBtn = screen.getByRole('button', { name: /Save/i });
    expect(saveBtn).toBeDisabled();
  });
});
