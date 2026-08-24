CREATE TABLE IF NOT EXISTS "repository_digest_template" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL UNIQUE,
  "name" text DEFAULT 'Repository alerts' NOT NULL,
  "enabled" integer DEFAULT 1 NOT NULL,
  "created_at" integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  "updated_at" integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS "repository_digest_template_user_id_uidx"
  ON "repository_digest_template" ("user_id");

CREATE TABLE IF NOT EXISTS "repository_digest_repository" (
  "id" text PRIMARY KEY NOT NULL,
  "template_id" text NOT NULL,
  "repository_full_name" text NOT NULL,
  "repository_url" text NOT NULL,
  "position" integer NOT NULL,
  "last_issue_ids" text DEFAULT '[]' NOT NULL,
  FOREIGN KEY ("template_id") REFERENCES "repository_digest_template"("id") ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX IF NOT EXISTS "repository_digest_repository_template_repo_uidx"
  ON "repository_digest_repository" ("template_id", "repository_full_name");
CREATE INDEX IF NOT EXISTS "repository_digest_repository_template_position_idx"
  ON "repository_digest_repository" ("template_id", "position");
