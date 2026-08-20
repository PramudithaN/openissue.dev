CREATE TABLE IF NOT EXISTS "saved_search" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "name" text NOT NULL,
  "tech" text NOT NULL,
  "label" text NOT NULL,
  "sort" text NOT NULL,
  "linked_pr" text NOT NULL,
  "hacktoberfest" text NOT NULL,
  "created_at" integer NOT NULL,
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON UPDATE no action ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS "saved_search_userId_idx" ON "saved_search" ("user_id");
