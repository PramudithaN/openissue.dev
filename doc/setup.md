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

Never commit `.env.local` or paste real tokens into issues, pull requests, or logs.

## Database

Run the SQL migrations in filename order against the Turso database:

1. `db/migrations/0001_better_auth.sql`
2. `db/migrations/0002_saved_search.sql`

The first migration creates Better Auth's user, session, account, and verification tables. The second creates user-owned saved searches. Migration files intentionally contain structure only—never credentials or production data.

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
4. Removing that search prevents it from returning after refresh.
