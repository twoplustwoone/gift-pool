import { data } from 'react-router';

/**
 * `request.formData()` for actions reachable without auth. A body that isn't
 * form-encoded (a JSON POST, a scanner, a truncated upload) makes it throw a
 * TypeError, which became a 500 and a Sentry issue per caller
 * (GIFTPOOL-UI-38). That is the client's mistake, so answer 400 instead —
 * handleError skips thrown 4xx responses.
 */
export async function requireFormData(request: Request) {
  try {
    return await request.formData();
  } catch (error) {
    if (error instanceof TypeError) {
      throw data('Expected a form submission', { status: 400 });
    }
    throw error;
  }
}
