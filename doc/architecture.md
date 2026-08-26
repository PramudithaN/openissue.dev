# Architecture and data flow

## Application overview

OpenIssue.dev uses the Next.js App Router. The main interface is a client component backed by route handlers for GitHub search, authentication, and saved-search persistence.

```mermaid
flowchart LR
  subgraph Client[Browser]
    UI[Issue Finder UI]
    Local[(Local storage)]
    UI <--> Local
  end

  subgraph App[Next.js application]
    SearchAPI["GET /api/search"]
    SearchService[Search and ranking]
    AuthAPI["/api/auth/*"]
    BetterAuth[Better Auth]
    SavedAPI["/api/saved-searches"]
    DigestAPI["/api/digest-preference"]
    DigestCron["Weekly digest cron"]
    Drizzle[Drizzle ORM]
  end

  subgraph External[External services]
    GitHubAPI[GitHub Search and REST APIs]
    GitHubOAuth[GitHub OAuth]
    Turso[(Turso / libSQL)]
    EmailAPI[Gmail SMTP]
  end

  UI -->|Search filters| SearchAPI
  SearchAPI --> SearchService
  SearchService -->|Issues and repository metadata| GitHubAPI
  SearchService -->|Ranked results| UI

  UI -->|Sign in or sign out| AuthAPI
  AuthAPI --> BetterAuth
  BetterAuth <--> GitHubOAuth
  BetterAuth --> Drizzle

  Local -->|Signed-in synchronization| SavedAPI
  SavedAPI -->|Validate session| BetterAuth
  SavedAPI --> Drizzle
  UI --> DigestAPI
  DigestAPI --> Drizzle
  DigestCron --> Drizzle
  DigestCron --> SearchService
  DigestCron --> EmailAPI
  Drizzle <--> Turso
```

## Issue discovery

`GET /api/search` validates and rate-limits requests before querying GitHub. Languages use GitHub language qualifiers; framework and ecosystem terms such as React, Next.js, Spring Boot, and Kubernetes use repository topics.

Candidate issues are enriched where possible with repository metadata, recent discussion, assignment state, linked pull requests, and Hacktoberfest signals. The application ranks them for contributor relevance and returns paginated results to the browser.

Search filters currently include:

- Technology or ecosystem
- Contributor-friendly label
- Recently updated, most commented, or newest sorting
- Any, present, or absent linked pull request
- All issues or Hacktoberfest-ready issues

## Authentication

Better Auth handles GitHub OAuth and stores users, provider accounts, and sessions in Turso through Drizzle. Authentication is optional for discovery and local saved searches.

Production uses `https://openissue-dev.vercel.app` as the OAuth proxy target. Allowed hosts include localhost, the production domain, and Vercel preview subdomains.

## Saved searches

Saved searches use a hybrid persistence model:

- Guests read and write browser `localStorage`.
- Signed-in users retain the same local behavior and synchronize with Turso.
- Existing local searches migrate after sign-in in batches of at most 100.
- Server records restore the local cache after browser data is cleared.
- Deletion is performed in Turso before the local record is removed.
- API queries and deletes are scoped to the authenticated user ID.
- Local data remains usable if cloud synchronization is temporarily unavailable.

## Data model

The database contains Better Auth's `user`, `session`, `account`, and `verification` tables plus `saved_search`. Saved searches reference `user.id` with cascading deletion and store the selected filter values and creation timestamp.

Schema definitions live in `src/lib/auth-schema.ts`; executable SQL is versioned under `db/migrations/`.

## Weekly digest

Signed-in users can enable or disable a weekly digest. The preference and last
successful delivery timestamp are stored on the user record. A protected Vercel
Cron route runs each Monday, loads each opted-in user's saved searches, reuses
the existing GitHub search and ranking service, deduplicates the highest-ranked
issues, and sends a concise email through Gmail SMTP. Successful delivery updates
the timestamp so a retried cron invocation does not send a duplicate digest.
GitHub searches are constrained to the previous completed UTC Monday–Sunday week.
The job stores one aggregate snapshot per normalized search and week, allowing a
later digest to describe activity as rising, falling, or steady. The first
observation is explicitly presented as a baseline.

Digest issue links open GitHub directly. Saved-search links include the existing
filter query parameters; the issue finder reads those parameters and runs the
linked search on load.

Authenticated users can also request their own digest immediately from the
saved-search card. The manual route uses the same delivery pipeline and six-day
cooldown as the scheduled job, so a successful manual delivery counts as that
week's digest and subsequent requests during the delivery window are rejected.

Repository alerts are stored as one editable template per user with at most five
ordered repositories and a daily, weekly, or fortnightly frequency. GitHub
repository search powers the autocomplete. The cron runs daily, evaluates the
repository template's independent last-delivery timestamp, and continues to
send saved-search recommendations on Mondays. During
delivery, the service fetches the five newest open issues for every selection and
includes their title, summary, labels, creation date, assignment state, comment
count, and direct link. The delivered issue IDs are persisted only after a
successful email; a repository-only digest is not sent when every selection is
unchanged.

Users may store one optional alternate alert email on their account. Recipient
resolution happens in the shared delivery service, so saved-search and repository
alerts both prefer that address and fall back to the GitHub-linked email when it
is cleared.
