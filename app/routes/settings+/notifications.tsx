import { redirect, type LoaderFunctionArgs } from 'react-router';

// Legacy path: notifications now live under /settings/profile/notifications
// so they inherit the settings shell. Magic links sent before the move still
// point here — forward them (preserving the `?token=...` query string) so
// old emails keep working.
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const target = `/settings/profile/notifications${url.search}`;
  return redirect(target);
}

export default function LegacyNotificationsRedirect() {
  return null;
}
