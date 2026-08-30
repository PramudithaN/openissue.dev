ALTER TABLE "saved_search" ADD COLUMN "experience" text DEFAULT 'any' NOT NULL;
ALTER TABLE "saved_search" ADD COLUMN "contribution_type" text DEFAULT 'any' NOT NULL;
ALTER TABLE "saved_search" ADD COLUMN "scope" text DEFAULT 'any' NOT NULL;
