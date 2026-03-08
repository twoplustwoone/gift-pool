import { data, type LoaderFunctionArgs } from 'react-router';
import { requireUserId } from '#app/utils/auth.server.ts';
import { loadFriendsPageData } from '#app/utils/friends-page.server.ts';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  return data(await loadFriendsPageData(userId));
}
