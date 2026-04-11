/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { describe, expect, it } from 'vitest';

import { SettingsSubpage } from './__settings-subpage.tsx';

function renderSubpage(
  props: Partial<React.ComponentProps<typeof SettingsSubpage>> = {},
) {
  const App = createRoutesStub([
    {
      path: '/',
      Component: () => (
        <SettingsSubpage title="Change email" {...props}>
          <p>Form body</p>
        </SettingsSubpage>
      ),
    },
    { path: '/settings/profile', Component: () => <div>settings hub</div> },
    {
      path: '/settings/profile/two-factor',
      Component: () => <div>2fa hub</div>,
    },
  ]);
  return render(<App initialEntries={['/']} />);
}

describe('<SettingsSubpage />', () => {
  it('renders the title, children, and default back link', () => {
    renderSubpage();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Change email' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Form body')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /back to settings/i }),
    ).toHaveAttribute('href', '/settings/profile');
  });

  it('renders the description when provided', () => {
    renderSubpage({ description: 'Update where login codes go.' });
    expect(
      screen.getByText('Update where login codes go.'),
    ).toBeInTheDocument();
  });

  it('omits the description element when none is provided', () => {
    const { container } = renderSubpage();
    expect(container.querySelectorAll('p')).toHaveLength(1); // only the children <p>
  });

  it('supports overriding the back destination and label', () => {
    renderSubpage({
      backTo: '/settings/profile/two-factor',
      backLabel: 'Back to two-factor',
    });
    expect(
      screen.getByRole('link', { name: /back to two-factor/i }),
    ).toHaveAttribute('href', '/settings/profile/two-factor');
  });
});
