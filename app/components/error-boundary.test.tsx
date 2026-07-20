/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { type ComponentProps } from 'react';
import { createRoutesStub } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { testConsole } from '#tests/setup/setup-test-env.ts';
import { ErrorFallback, GeneralErrorBoundary } from './error-boundary.tsx';

const captureException = vi.fn();
vi.mock('@sentry/react-router', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    captureException: (...args: Array<unknown>) => captureException(...args),
  };
});

function renderAtRoute(loader: () => never) {
  const Stub = createRoutesStub([
    {
      path: '/',
      loader,
      Component: () => null,
      ErrorBoundary: () => <GeneralErrorBoundary />,
    },
  ]);
  return render(<Stub initialEntries={['/']} />);
}

// ErrorFallback renders a react-router <Link>, which needs a Router context
// — render it via createRoutesStub rather than a bare render().
function renderFallback(props: ComponentProps<typeof ErrorFallback>) {
  const Stub = createRoutesStub([
    { path: '/', Component: () => <ErrorFallback {...props} /> },
  ]);
  return render(<Stub initialEntries={['/']} />);
}

describe('ErrorFallback', () => {
  it('renders an icon, title, description, and a link back home', () => {
    renderFallback({
      icon: 'magnifying-glass',
      title: "We can't find this page",
      description: 'It may have moved or never existed.',
    });

    expect(
      screen.getByRole('heading', { name: "We can't find this page" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('It may have moved or never existed.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('omits the description paragraph when none is given', () => {
    renderFallback({ icon: 'lock-closed', title: 'Not allowed' });

    expect(screen.getByRole('heading', { name: 'Not allowed' })).toBeInTheDocument();
    expect(
      screen.queryByText('It may have moved or never existed.'),
    ).not.toBeInTheDocument();
  });
});

describe('GeneralErrorBoundary default handlers', () => {
  it('renders a not-found fallback for a 404 with the response body as description', async () => {
    renderAtRoute(() => {
      throw new Response('That page does not exist.', { status: 404 });
    });

    expect(
      await screen.findByRole('heading', { name: "We can't find this page" }),
    ).toBeInTheDocument();
    expect(screen.getByText('That page does not exist.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to home' })).toBeInTheDocument();
  });

  it('renders a generic fallback naming the status code for other error responses', async () => {
    renderAtRoute(() => {
      throw new Response('Server had a bad day.', { status: 500 });
    });

    expect(
      await screen.findByRole('heading', { name: 'Something went wrong (500)' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Server had a bad day.')).toBeInTheDocument();
  });

  it('renders the generic unexpected-error fallback for thrown non-Response errors', async () => {
    testConsole.error.mockImplementation(() => {});

    renderAtRoute(() => {
      throw new Error('boom');
    });

    expect(
      await screen.findByRole('heading', { name: 'Something went wrong' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Please try again, or head back home.'),
    ).toBeInTheDocument();
    expect(captureException).toHaveBeenCalled();
  });

  it('still honors a caller-provided statusHandlers override', async () => {
    const Stub = createRoutesStub([
      {
        path: '/',
        loader() {
          throw new Response('nope', { status: 404 });
        },
        Component: () => null,
        ErrorBoundary: () => (
          <GeneralErrorBoundary
            statusHandlers={{
              404: () => <p>Custom not-found copy</p>,
            }}
          />
        ),
      },
    ]);
    render(<Stub initialEntries={['/']} />);

    expect(await screen.findByText('Custom not-found copy')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: "We can't find this page" }),
    ).not.toBeInTheDocument();
  });
});
