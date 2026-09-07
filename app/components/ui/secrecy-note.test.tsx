/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SecrecyNote } from './secrecy-note.tsx';

describe('SecrecyNote', () => {
  it('is a labelled complementary region with the title and body', () => {
    render(
      <SecrecyNote title="Totals only">You can't see who has who.</SecrecyNote>,
    );
    const note = screen.getByRole('complementary', { name: 'Totals only' });
    expect(note).toHaveTextContent("You can't see who has who.");
    expect(note.className).toContain('border-dashed');
  });

  it('falls back to a generic label without a title', () => {
    render(<SecrecyNote>Nothing here names a person.</SecrecyNote>);
    expect(
      screen.getByRole('complementary', { name: 'What stays private' }),
    ).toBeInTheDocument();
  });
});
