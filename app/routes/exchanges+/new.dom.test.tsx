/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react';
import * as ReactRouter from 'react-router';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Group = { id: string; name: string; memberCount: number };
type Member = {
  id: string;
  username: string;
  name: string | null;
  image: null;
};

const snapshot: {
  groups: Group[];
  group: (Group & { members: Member[] }) | null;
} = { groups: [], group: null };

const actionSnapshot:
  | {
      errors?: Record<string, string>;
    }
  | undefined = {};

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof ReactRouter>('react-router');
  return {
    ...actual,
    useLoaderData: () => snapshot,
    useActionData: () => actionSnapshot,
    useNavigation: () => ({ state: 'idle' as const }),
    Form: ({ children }: { children?: React.ReactNode }) => (
      <form>{children}</form>
    ),
  };
});

vi.mock('#app/components/ui/responsive-dialog.tsx', () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => (
    <>{children}</>
  );
  const Open = ({
    children,
    open,
  }: {
    children?: React.ReactNode;
    open?: boolean;
  }) => (open === false ? null : <>{children}</>);
  return {
    ResponsiveDialog: Open,
    ResponsiveDialogTrigger: Pass,
    ResponsiveDialogContent: ({ children }: { children?: React.ReactNode }) => (
      <div role="dialog">{children}</div>
    ),
    ResponsiveDialogHeader: Pass,
    ResponsiveDialogFooter: Pass,
    ResponsiveDialogTitle: ({ children }: { children?: React.ReactNode }) => (
      <h2>{children}</h2>
    ),
    ResponsiveDialogDescription: ({
      children,
    }: {
      children?: React.ReactNode;
    }) => <p>{children}</p>,
    ResponsiveDialogClose: Pass,
  };
});

import NewExchange from './new.tsx';

const member = (id: string, name: string): Member => ({
  id,
  username: id,
  name,
  image: null,
});

const renderNew = () =>
  render(
    <MemoryRouter initialEntries={['/exchanges/new']}>
      <NewExchange />
    </MemoryRouter>,
  );

beforeEach(() => {
  snapshot.groups = [];
  snapshot.group = null;
  delete actionSnapshot.errors;
});

describe('new exchange', () => {
  it('asks which group first, since the roster is the group', () => {
    snapshot.groups = [
      { id: 'g1', name: 'The Painted', memberCount: 6 },
      { id: 'g2', name: 'Book Club', memberCount: 4 },
    ];
    renderNew();
    expect(screen.getByText(/Which group is this for\?/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /The Painted 6 members/ }),
    ).toHaveAttribute('href', '/exchanges/new?groupId=g1');
    expect(screen.getByText('4 members')).toBeInTheDocument();
    // No form until a group is chosen.
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('sends someone with no group to make one first', () => {
    renderNew();
    expect(screen.getByText("You're not in a group yet")).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'See your groups' }),
    ).toHaveAttribute('href', '/groups');
  });

  it('shows the form for a chosen group, with the secrecy promise before committing', () => {
    snapshot.groups = [{ id: 'g1', name: 'The Painted', memberCount: 3 }];
    snapshot.group = {
      id: 'g1',
      name: 'The Painted',
      memberCount: 3,
      members: [member('fd', 'Francisco'), member('np', 'Nicolas')],
    };
    renderNew();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Exchange date')).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Give everyone someone new' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save and gather people' }),
    ).toBeInTheDocument();
    // The promise is made before the organizer commits, not after.
    expect(
      screen.getByRole('complementary', { name: "You won't see the pairings" }),
    ).toHaveTextContent('not before the reveal');
    const next = screen.getByText('What happens next').closest('div')!;
    expect(
      within(next).getByText(/The Painted members opt in/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'change' })).toHaveAttribute(
      'href',
      '/exchanges/new',
    );
  });

  it('surfaces field errors from the action', () => {
    snapshot.groups = [{ id: 'g1', name: 'The Painted', memberCount: 3 }];
    snapshot.group = {
      id: 'g1',
      name: 'The Painted',
      memberCount: 3,
      members: [member('fd', 'Francisco')],
    };
    actionSnapshot.errors = {
      title: 'Give the exchange a name.',
      form: 'The exchange date needs to be in the future.',
    };
    renderNew();
    const alerts = screen.getAllByRole('alert').map((a) => a.textContent);
    expect(alerts).toContain('Give the exchange a name.');
    expect(alerts).toContain('The exchange date needs to be in the future.');
    expect(screen.getByLabelText('Name')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });
});
