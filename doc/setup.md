# Setup and deployment

## Prerequisites

- Node.js 22 or newer
- npm
- A GitHub personal access token for issue search
- A Turso database and authentication token
- A GitHub OAuth app for sign-in

## Local configuration

Install dependencies and copy the environment template:

```bash
npm install
cp .env.example .env.local
```

Configure these values in `.env.local`:

| Variable | Purpose |
| --- | --- |
| `GITHUB_TOKEN` | Raises GitHub API limits and enables repository, comment, and linked-PR enrichment |
| `TURSO_DATABASE_URL` | libSQL URL for the Turso database |
| `TURSO_AUTH_TOKEN` | Turso database authentication token |
| `BETTER_AUTH_SECRET` | Secret used to protect authentication state; use at least 32 random characters |
| `BETTER_AUTH_URL` | Application origin, such as `http://localhost:3000` |
| `OAUTH_PROXY_SECRET` | Shared secret used by Better Auth's OAuth proxy for preview deployments |
| `GITHUB_CLIENT_ID` | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth app client secret |
| `CRON_SECRET` | Bearer secret used to authorize the weekly Vercel Cron request |
| `SMTP_USER` | Gmail address used to deliver weekly digest emails |
| `SMTP_APP_PASSWORD` | Google App Password for authenticated Gmail SMTP |
| `DIGEST_FROM_EMAIL` | Display name and Gmail sender address for digest emails |

Never commit `.env.local` or paste real tokens into issues, pull requests, or logs.

## Database

Run the SQL migrations in filename order against the Turso database:

1. `db/migrations/0001_better_auth.sql`
2. `db/migrations/0002_saved_search.sql`
3. `db/migrations/0003_weekly_digest.sql`
4. `db/migrations/0004_repository_digest.sql`
5. `db/migrations/0005_repository_digest_frequency.sql`
6. `db/migrations/0006_alert_email.sql`
7. `db/migrations/0007_admin.sql`
8. `db/migrations/0008_opportunity.sql`

The first migration creates Better Auth's user, session, account, and verification tables. The second creates user-owned saved searches. Migration files intentionally contain structure only—never credentials or production data.

The third migration adds the weekly digest preference and last-delivery timestamp
to users and creates shared weekly GitHub activity snapshots. The fourth stores
each user's repository-alert template, selected repositories, display order, and
the last delivered issue IDs used to skip unchanged repository-only digests.
The fifth adds the user-selected daily, weekly, or fortnightly repository-alert
frequency and its independent successful-delivery timestamp.
The sixth adds an optional account-level alert email; when set, every digest is
sent there instead of the GitHub-linked address. `vercel.json`
invokes `/api/cron/weekly-digest` daily at 09:00 UTC; saved-search recommendations
remain restricted to Mondays. Enable 2-Step Verification for the Gmail sender, create a dedicated
Google App Password, and configure `SMTP_USER`, `SMTP_APP_PASSWORD`, and
`DIGEST_FROM_EMAIL` before enabling digests in production. Store the App
Password only in protected environment variables; never commit it.
The seventh adds explicit administrator membership. The eighth stores one
deduplicated opportunity record for each issue a signed-in user saves or opens;
it does not store the user's GitHub contribution history.

## GitHub OAuth

Create a GitHub OAuth app and configure these callback URLs:

- Production: `https://openissue-dev.vercel.app/api/auth/callback/github`
- Local: `http://localhost:3000/api/auth/callback/github`

The application uses Better Auth's OAuth proxy so dynamic Vercel preview deployments can complete authentication through the stable production callback. Keep `OAUTH_PROXY_SECRET` identical across the relevant Vercel environments.

## Vercel

Add all variables from `.env.example` in the Vercel project settings. Use the production application URL for `BETTER_AUTH_URL` in Production. Preview URLs are allowed by the application and authenticate through the OAuth proxy.

After deploying, verify:

1. Issue search returns live results.
2. GitHub sign-in returns to the application.
3. A signed-in saved search is restored after clearing local storage.
4. A signed-in user can view their public GitHub issues and pull requests with current statuses and direct links.
5. Saving or opening the same issue repeatedly retains one opportunity record and updates its timestamps.
6. Matching authored issues in contribution history show saved or opened badges.
7. Removing that search prevents it from returning after refresh.
8. Enabling and disabling the weekly digest persists after refresh.
9. An authorized manual request to the digest cron route sends a digest only to opted-in users with saved searches.
10. A signed-in user with a cloud saved search can use **Send digest now** once per weekly delivery window.
11. A signed-in user can save, reopen, revise, enable, or disable a repository-alert template containing at most five autocomplete-selected repositories and select daily, weekly, or fortnightly delivery.
