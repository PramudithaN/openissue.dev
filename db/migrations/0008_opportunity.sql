CREATE TABLE IF NOT EXISTS "opportunity" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "repository_full_name" text NOT NULL,
  "issue_number" integer NOT NULL,
  "issue_url" text NOT NULL,
  "title" text NOT NULL,
  "saved_at" integer,
  "opened_at" integer,
  "created_at" integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  "updated_at" integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS "opportunity_user_repository_issue_uidx"
  ON "opportunity" ("user_id", "repository_full_name", "issue_number");

CREATE INDEX IF NOT EXISTS "opportunity_user_id_idx"
  ON "opportunity" ("user_id");
