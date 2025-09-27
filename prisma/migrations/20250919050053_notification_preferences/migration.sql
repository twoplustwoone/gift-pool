-- CreateTable
CREATE TABLE "UserNotificationPreference" (
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("userId", "type"),
    CONSTRAINT "UserNotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificationPreferenceAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "previousValue" BOOLEAN NOT NULL,
    "newValue" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationPreferenceAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "UserNotificationPreference_type_idx" ON "UserNotificationPreference"("type");

-- CreateIndex
CREATE INDEX "NotificationPreferenceAudit_userId_createdAt_idx" ON "NotificationPreferenceAudit"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationPreferenceAudit_type_idx" ON "NotificationPreferenceAudit"("type");

-- CreateIndex
CREATE INDEX "NotificationPreferenceAudit_channel_idx" ON "NotificationPreferenceAudit"("channel");

-- Rename existing notification types to the new registry values
UPDATE "Notification"
SET "type" = 'FRIEND_REQUEST_RECEIVED'
WHERE "type" = 'FRIEND_REQUEST';

-- Seed default preferences for existing users
INSERT OR IGNORE INTO "UserNotificationPreference" (
    "userId",
    "type",
    "inAppEnabled",
    "emailEnabled",
    "createdAt",
    "updatedAt"
)
SELECT
    "id" as userId,
    'FRIEND_REQUEST_RECEIVED' as type,
    1 as inAppEnabled,
    1 as emailEnabled,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "User";

INSERT OR IGNORE INTO "UserNotificationPreference" (
    "userId",
    "type",
    "inAppEnabled",
    "emailEnabled",
    "createdAt",
    "updatedAt"
)
SELECT
    "id" as userId,
    'FRIEND_REQUEST_ACCEPTED' as type,
    1 as inAppEnabled,
    1 as emailEnabled,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "User";

INSERT OR IGNORE INTO "UserNotificationPreference" (
    "userId",
    "type",
    "inAppEnabled",
    "emailEnabled",
    "createdAt",
    "updatedAt"
)
SELECT
    "id" as userId,
    'UPCOMING_BIRTHDAY' as type,
    1 as inAppEnabled,
    0 as emailEnabled,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "User";
