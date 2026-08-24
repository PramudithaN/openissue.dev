ALTER TABLE "repository_digest_template"
  ADD COLUMN "frequency" text DEFAULT 'weekly' NOT NULL;
ALTER TABLE "repository_digest_template"
  ADD COLUMN "last_sent_at" integer;
