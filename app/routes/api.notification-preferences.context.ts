import { invariantResponse } from '@epic-web/invariant';
import { data, type ActionFunctionArgs } from 'react-router';
import { requireUserId } from '#app/utils/auth.server.ts';
import {
  isNotificationTopic,
  type NotificationContext,
} from '#app/utils/notification-catalog.ts';
import { isNotificationActivityLevel } from '#app/utils/notification-context.ts';
import {
  clearContextActivityPreference,
  dismissContextNotificationNotice,
  setContextActivityPreference,
} from '#app/utils/notification-preferences.server.ts';

const SOURCE = 'context:notification-settings';

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const intent = formData.get('intent');
  const context = parseContext(formData);

  if (intent === 'set-activity') {
    const activityLevel = formData.get('activityLevel');
    invariantResponse(
      isNotificationActivityLevel(activityLevel),
      'Invalid notification activity level',
    );
    const customTopics = formData
      .getAll('customTopic')
      .filter(isNotificationTopic);
    await setContextActivityPreference({
      userId,
      context,
      activityLevel,
      customTopics,
      source: SOURCE,
    });
    return { ok: true };
  }

  if (intent === 'clear-activity') {
    await clearContextActivityPreference({ userId, context, source: SOURCE });
    return { ok: true };
  }

  if (intent === 'dismiss-notice') {
    await dismissContextNotificationNotice({
      userId,
      context,
      source: SOURCE,
    });
    return { ok: true };
  }

  return data({ ok: false }, { status: 400 });
}

function parseContext(formData: FormData): NotificationContext {
  const kind = formData.get('contextKind');
  const id = formData.get('contextId');
  invariantResponse(typeof id === 'string' && id.length > 0, 'Invalid context');
  invariantResponse(kind === 'GROUP' || kind === 'POOL', 'Invalid context');
  return kind === 'GROUP' ? { kind, groupId: id } : { kind, poolId: id };
}
