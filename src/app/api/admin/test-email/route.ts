import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import {
  admin,
  savedSearch,
} from "@/lib/auth-schema";
import { getDatabase } from "@/lib/db";
import { buildRepositoryDigest } from "@/features/issues/server/repository-digest";
import {
  getRepositoryDigestSource,
  renderAlertEmail,
} from "@/features/issues/server/digest-delivery";
import {
  buildWeeklyDigest,
  sendWeeklyDigest,
} from "@/features/issues/server/weekly-digest";

const TEST_EMAIL_MODES = {
  "saved-search": {
    includeSavedSearches: true,
    includeRepositoryAlerts: false,
    heading: "Your saved-search alerts",
    summary: "Fresh recommendations from your saved searches",
  },
  repository: {
    includeSavedSearches: false,
    includeRepositoryAlerts: true,
    heading: "Your repository alerts",
    summary: undefined,
  },
  combined: {
    includeSavedSearches: true,
    includeRepositoryAlerts: true,
    heading: "Your OpenIssue.dev alerts",
    summary: "Saved-search recommendations and watched repository activity",
  },
} as const;

type TestEmailMode = keyof typeof TEST_EMAIL_MODES;

function isValidEmail(value: string) {
  if (!value || value.length > 254) return false;
  const atIndex = value.indexOf("@");
  if (atIndex <= 0 || atIndex !== value.lastIndexOf("@")) return false;
  const domain = value.slice(atIndex + 1);
  const dotIndex = domain.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === domain.length - 1) return false;

  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (code <= 32 || code === 127) return false;
  }
  return true;
}

function readBodyField(body: unknown, field: string) {
  if (!body || typeof body !== "object" || !(field in body)) return "";
  return String((body as Record<string, unknown>)[field]).trim();
}

async function parseTestEmailRequest(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const recipientEmail = readBodyField(body, "recipientEmail");
  if (!isValidEmail(recipientEmail)) {
    return Response.json({ error: "Enter a valid recipient email." }, { status: 400 });
  }

  const mode = readBodyField(body, "mode");
  if (!Object.hasOwn(TEST_EMAIL_MODES, mode)) {
    return Response.json({ error: "Select a valid test email type." }, { status: 400 });
  }

  return { recipientEmail, mode: mode as TestEmailMode };
}

async function getAdminSession(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return { session: null, isAdmin: false };

  const database = getDatabase();
  const [adminRow] = await database
    .select({ userId: admin.userId })
    .from(admin)
    .where(eq(admin.userId, session.user.id))
    .limit(1);
  return { session, isAdmin: Boolean(adminRow) };
}

export async function GET(request: Request) {
  const access = await getAdminSession(request);
  if (!access.session) return Response.json({ error: "Unauthorized." }, { status: 401 });
  return Response.json({ isAdmin: access.isAdmin });
}

async function sendAdminTestEmail(request: Request) {
  const access = await getAdminSession(request);
  if (!access.session) return Response.json({ error: "Unauthorized." }, { status: 401 });
  if (!access.isAdmin) return Response.json({ error: "Forbidden." }, { status: 403 });

  const input = await parseTestEmailRequest(request);
  if (input instanceof Response) return input;
  const { recipientEmail, mode } = input;
  const modeConfig = TEST_EMAIL_MODES[mode];
  if (
    !process.env.SMTP_USER ||
    !process.env.SMTP_APP_PASSWORD ||
    !process.env.DIGEST_FROM_EMAIL
  ) {
    return Response.json(
      { error: "Test email delivery is not configured for this environment." },
      { status: 503 },
    );
  }

  const database = getDatabase();
  const searchesPromise = modeConfig.includeSavedSearches
    ? database
        .select()
        .from(savedSearch)
        .where(eq(savedSearch.userId, access.session.user.id))
    : Promise.resolve([]);
  const repositorySourcePromise = modeConfig.includeRepositoryAlerts
    ? getRepositoryDigestSource(database, access.session.user.id, false)
    : Promise.resolve({ template: undefined, repositories: [] });
  const [searches, { repositories }] = await Promise.all([
    searchesPromise,
    repositorySourcePromise,
  ]);

  if (modeConfig.includeSavedSearches && !searches.length) {
    return Response.json(
      { error: "Save at least one search before sending this test." },
      { status: 400 },
    );
  }
  if (modeConfig.includeRepositoryAlerts && !repositories.length) {
    return Response.json(
      { error: "Save at least one repository alert before sending this test." },
      { status: 400 },
    );
  }

  const baseUrl = process.env.BETTER_AUTH_URL ?? "https://openissue-dev.vercel.app";
  const [weeklyDigest, repositoryDigest] = await Promise.all([
    modeConfig.includeSavedSearches
      ? buildWeeklyDigest(
          searches.map((search) => ({
            ...search,
            createdAt: search.createdAt.toISOString(),
          })),
          baseUrl,
        )
      : null,
    modeConfig.includeRepositoryAlerts ? buildRepositoryDigest(repositories) : null,
  ]);
  const issueCount =
    (weeklyDigest?.issueCount ?? 0) + (repositoryDigest?.issueCount ?? 0);
  const savedSearchContent = weeklyDigest
    ? `<tr><td class="mobile-pad" style="padding:24px 32px 0 32px;color:#d1d5db;">${weeklyDigest.html}</td></tr>`
    : "";
  await sendWeeklyDigest({
    to: recipientEmail,
    subject: `[Test] ${issueCount} open-source issues for you this week`,
    html: renderAlertEmail({
      content: `${savedSearchContent}${repositoryDigest?.html ?? ""}`,
      issueCount,
      repositoryCount: repositoryDigest?.repositoryCount ?? 0,
      baseUrl,
      heading: modeConfig.heading,
      summary: modeConfig.summary,
    }),
  });

  return Response.json({ sent: true });
}

export async function POST(request: Request) {
  try {
    return await sendAdminTestEmail(request);
  } catch (error) {
    console.error("Unable to send admin test email.", error);
    return Response.json({ error: "Unable to send the test email." }, { status: 502 });
  }
}
