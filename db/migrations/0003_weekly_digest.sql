ALTER TABLE "user" ADD COLUMN "weekly_digest_enabled" integer DEFAULT 0 NOT NULL;
ALTER TABLE "user" ADD COLUMN "weekly_digest_last_sent_at" integer;

CREATE TABLE IF NOT EXISTS "digest_trend_snapshot" (
  "id" text PRIMARY KEY NOT NULL,
  "search_key" text NOT NULL,
  "week_start" integer NOT NULL,
  "issue_count" integer NOT NULL,
  "top_repository" text,
  "top_repository_issue_count" integer DEFAULT 0 NOT NULL,
  "created_at" integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "digest_trend_snapshot_search_week_uidx"
  ON "digest_trend_snapshot" ("search_key", "week_start");
