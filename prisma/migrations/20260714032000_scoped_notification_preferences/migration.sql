-- Create the sparse central preference tables.
CREATE TABLE "NotificationChannelPreference" (
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    PRIMARY KEY ("userId", "channel"),
    CONSTRAINT "NotificationChannelPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "NotificationCategoryPreference" (
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    PRIMARY KEY ("userId", "category", "channel"),
    CONSTRAINT "NotificationCategoryPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "NotificationTopicPreference" (
    "userId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    PRIMARY KEY ("userId", "topic", "channel"),
    CONSTRAINT "NotificationTopicPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Context preferences use real group/pool foreign keys rather than a free-form
-- polymorphic identifier. A null activityLevel means "inherit" and permits a
-- row to retain notice-dismissal state for an inherited group mute.
CREATE TABLE "GroupNotificationPreference" (
    "userId" TEXT NOT NULL,
    "giftGroupId" TEXT NOT NULL,
    "activityLevel" TEXT,
    "customTopics" TEXT,
    "mutedAt" DATETIME,
    "noticeDismissedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    PRIMARY KEY ("userId", "giftGroupId"),
    CONSTRAINT "GroupNotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GroupNotificationPreference_giftGroupId_fkey" FOREIGN KEY ("giftGroupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "PoolNotificationPreference" (
    "userId" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "activityLevel" TEXT,
    "customTopics" TEXT,
    "mutedAt" DATETIME,
    "noticeDismissedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    PRIMARY KEY ("userId", "poolId"),
    CONSTRAINT "PoolNotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PoolNotificationPreference_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "NotificationChannelPreference_channel_idx" ON "NotificationChannelPreference"("channel");
CREATE INDEX "NotificationCategoryPreference_category_channel_idx" ON "NotificationCategoryPreference"("category", "channel");
CREATE INDEX "NotificationTopicPreference_topic_channel_idx" ON "NotificationTopicPreference"("topic", "channel");
CREATE INDEX "GroupNotificationPreference_giftGroupId_idx" ON "GroupNotificationPreference"("giftGroupId");
CREATE INDEX "PoolNotificationPreference_poolId_idx" ON "PoolNotificationPreference"("poolId");

-- Preserve the legacy "turn off all email" choice as a durable channel gate.
-- Require all three registered legacy rows so a partial historical row set
-- cannot accidentally disable future email topics.
INSERT INTO "NotificationChannelPreference" (
    "userId", "channel", "enabled", "createdAt", "updatedAt"
)
SELECT
    "userId", 'EMAIL', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "UserNotificationPreference"
WHERE "type" IN (
    'FRIEND_REQUEST_RECEIVED',
    'FRIEND_REQUEST_ACCEPTED',
    'UPCOMING_BIRTHDAY'
)
GROUP BY "userId"
HAVING COUNT(DISTINCT "type") = 3 AND MAX("emailEnabled") = 0;

-- Both friend-request events intentionally share one user-facing topic. When
-- legacy rows conflict, MIN chooses the more restrictive value so migration
-- never creates surprise delivery. Missing rows contribute the catalog default.
WITH "FriendValues" AS (
    SELECT
        "User"."id" AS "userId",
        MIN(
            COALESCE((
                SELECT "inAppEnabled" FROM "UserNotificationPreference"
                WHERE "userId" = "User"."id" AND "type" = 'FRIEND_REQUEST_RECEIVED'
            ), true),
            COALESCE((
                SELECT "inAppEnabled" FROM "UserNotificationPreference"
                WHERE "userId" = "User"."id" AND "type" = 'FRIEND_REQUEST_ACCEPTED'
            ), true)
        ) AS "inAppEnabled",
        MIN(
            COALESCE((
                SELECT "emailEnabled" FROM "UserNotificationPreference"
                WHERE "userId" = "User"."id" AND "type" = 'FRIEND_REQUEST_RECEIVED'
            ), true),
            COALESCE((
                SELECT "emailEnabled" FROM "UserNotificationPreference"
                WHERE "userId" = "User"."id" AND "type" = 'FRIEND_REQUEST_ACCEPTED'
            ), true)
        ) AS "emailEnabled",
        MIN(
            COALESCE((
                SELECT "pushEnabled" FROM "UserNotificationPreference"
                WHERE "userId" = "User"."id" AND "type" = 'FRIEND_REQUEST_RECEIVED'
            ), false),
            COALESCE((
                SELECT "pushEnabled" FROM "UserNotificationPreference"
                WHERE "userId" = "User"."id" AND "type" = 'FRIEND_REQUEST_ACCEPTED'
            ), false)
        ) AS "pushEnabled"
    FROM "User"
)
INSERT INTO "NotificationTopicPreference" (
    "userId", "topic", "channel", "enabled", "createdAt", "updatedAt"
)
SELECT "userId", 'FRIEND_REQUESTS', 'IN_APP', "inAppEnabled", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "FriendValues" WHERE "inAppEnabled" != true
UNION ALL
SELECT "userId", 'FRIEND_REQUESTS', 'EMAIL', "emailEnabled", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "FriendValues"
WHERE "emailEnabled" != true
  AND NOT EXISTS (
      SELECT 1 FROM "NotificationChannelPreference" AS "gate"
      WHERE "gate"."userId" = "FriendValues"."userId"
        AND "gate"."channel" = 'EMAIL'
        AND "gate"."enabled" = false
  )
UNION ALL
SELECT "userId", 'FRIEND_REQUESTS', 'WEB_PUSH', "pushEnabled", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "FriendValues" WHERE "pushEnabled" != false;

-- Birthday reminders map one-to-one to their topic, so every non-default value
-- can migrate directly. Email rows covered by the global gate remain inherited.
INSERT INTO "NotificationTopicPreference" (
    "userId", "topic", "channel", "enabled", "createdAt", "updatedAt"
)
SELECT "userId", 'BIRTHDAY_REMINDERS', 'IN_APP', "inAppEnabled", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "UserNotificationPreference"
WHERE "type" = 'UPCOMING_BIRTHDAY' AND "inAppEnabled" != true
UNION ALL
SELECT "userId", 'BIRTHDAY_REMINDERS', 'EMAIL', "emailEnabled", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "UserNotificationPreference" AS "legacy"
WHERE "type" = 'UPCOMING_BIRTHDAY'
  AND "emailEnabled" != false
  AND NOT EXISTS (
      SELECT 1 FROM "NotificationChannelPreference" AS "gate"
      WHERE "gate"."userId" = "legacy"."userId"
        AND "gate"."channel" = 'EMAIL'
        AND "gate"."enabled" = false
  )
UNION ALL
SELECT "userId", 'BIRTHDAY_REMINDERS', 'WEB_PUSH', "pushEnabled", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "UserNotificationPreference"
WHERE "type" = 'UPCOMING_BIRTHDAY' AND "pushEnabled" != false;

DROP TABLE "UserNotificationPreference";

-- Generalize the audit log so channel, category, topic, group, and pool changes
-- share one history without boolean-only or concrete-event-only columns.
ALTER TABLE "NotificationPreferenceAudit" RENAME TO "LegacyNotificationPreferenceAudit";

CREATE TABLE "NotificationPreferenceAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "preferenceKey" TEXT,
    "channel" TEXT,
    "contextKind" TEXT,
    "contextId" TEXT,
    "previousValue" TEXT,
    "newValue" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationPreferenceAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "NotificationPreferenceAudit" (
    "id", "userId", "kind", "preferenceKey", "channel",
    "previousValue", "newValue", "source", "createdAt"
)
SELECT
    "id", "userId", 'LEGACY_EVENT', "type", "channel",
    CASE WHEN "previousValue" THEN 'true' ELSE 'false' END,
    CASE WHEN "newValue" THEN 'true' ELSE 'false' END,
    "source", "createdAt"
FROM "LegacyNotificationPreferenceAudit";

DROP TABLE "LegacyNotificationPreferenceAudit";

CREATE INDEX "NotificationPreferenceAudit_userId_createdAt_idx" ON "NotificationPreferenceAudit"("userId", "createdAt");
CREATE INDEX "NotificationPreferenceAudit_kind_preferenceKey_idx" ON "NotificationPreferenceAudit"("kind", "preferenceKey");
CREATE INDEX "NotificationPreferenceAudit_channel_idx" ON "NotificationPreferenceAudit"("channel");
