import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

const migrationPath = path.join(
  process.cwd(),
  'prisma/migrations/20260714032000_scoped_notification_preferences/migration.sql',
);

describe('scoped notification preference migration', () => {
  let db: Database.Database | null = null;

  afterEach(() => {
    db?.close();
    db = null;
  });

  it('preserves defaults, derives the email gate, and consolidates conflicts conservatively', () => {
    db = new Database(':memory:');
    db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE "User" ("id" TEXT NOT NULL PRIMARY KEY);
      CREATE TABLE "UserNotificationPreference" (
        "userId" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "inAppEnabled" BOOLEAN NOT NULL,
        "emailEnabled" BOOLEAN NOT NULL,
        "pushEnabled" BOOLEAN NOT NULL,
        "createdAt" DATETIME NOT NULL,
        "updatedAt" DATETIME NOT NULL,
        PRIMARY KEY ("userId", "type")
      );
      CREATE TABLE "NotificationPreferenceAudit" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "channel" TEXT NOT NULL,
        "previousValue" BOOLEAN NOT NULL,
        "newValue" BOOLEAN NOT NULL,
        "source" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL
      );
    `);

    const users = ['defaults', 'all-off', 'conflict', 'birthday-opt-in'];
    const insertUser = db.prepare('INSERT INTO "User" ("id") VALUES (?)');
    const insertPreference = db.prepare(`
      INSERT INTO "UserNotificationPreference" (
        "userId", "type", "inAppEnabled", "emailEnabled", "pushEnabled",
        "createdAt", "updatedAt"
      ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    for (const userId of users) insertUser.run(userId);
    for (const userId of users) {
      insertPreference.run(
        userId,
        'FRIEND_REQUEST_RECEIVED',
        1,
        userId === 'all-off' || userId === 'conflict' ? 0 : 1,
        0,
      );
      insertPreference.run(
        userId,
        'FRIEND_REQUEST_ACCEPTED',
        1,
        userId === 'all-off' ? 0 : 1,
        0,
      );
      insertPreference.run(
        userId,
        'UPCOMING_BIRTHDAY',
        1,
        userId === 'birthday-opt-in' ? 1 : 0,
        0,
      );
    }
    db.prepare(
      `
      INSERT INTO "NotificationPreferenceAudit" VALUES (
        'audit-1', 'conflict', 'FRIEND_REQUEST_RECEIVED', 'EMAIL',
        1, 0, 'legacy-settings', CURRENT_TIMESTAMP
      )
    `,
    ).run();

    db.exec(fs.readFileSync(migrationPath, 'utf8'));

    expect(
      db
        .prepare(
          'SELECT * FROM "NotificationChannelPreference" WHERE "userId" = ? AND "channel" = ?',
        )
        .get('all-off', 'EMAIL'),
    ).toMatchObject({ enabled: 0 });
    expect(
      db
        .prepare(
          'SELECT * FROM "NotificationTopicPreference" WHERE "userId" = ?',
        )
        .all('defaults'),
    ).toEqual([]);
    expect(
      db
        .prepare(
          'SELECT * FROM "NotificationTopicPreference" WHERE "userId" = ? AND "topic" = ? AND "channel" = ?',
        )
        .get('conflict', 'FRIEND_REQUESTS', 'EMAIL'),
    ).toMatchObject({ enabled: 0 });
    expect(
      db
        .prepare(
          'SELECT * FROM "NotificationTopicPreference" WHERE "userId" = ? AND "topic" = ? AND "channel" = ?',
        )
        .get('birthday-opt-in', 'BIRTHDAY_REMINDERS', 'EMAIL'),
    ).toMatchObject({ enabled: 1 });
    expect(
      db
        .prepare(
          'SELECT "kind", "preferenceKey", "previousValue", "newValue" FROM "NotificationPreferenceAudit" WHERE "id" = ?',
        )
        .get('audit-1'),
    ).toEqual({
      kind: 'LEGACY_EVENT',
      preferenceKey: 'FRIEND_REQUEST_RECEIVED',
      previousValue: 'true',
      newValue: 'false',
    });
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'UserNotificationPreference'",
        )
        .get(),
    ).toBeUndefined();
  });
});
