import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { opportunity } from "@/lib/auth-schema";
import { getDatabase } from "@/lib/db";
import type { OpportunityAction } from "@/features/issues/types/opportunity";

const MAX_TITLE_LENGTH = 500;

function serializeOpportunity(row: typeof opportunity.$inferSelect) {
  return {
    id: row.id,
    repositoryFullName: row.repositoryFullName,
    issueNumber: row.issueNumber,
    issueUrl: row.issueUrl,
    title: row.title,
    savedAt: row.savedAt?.toISOString() ?? null,
    openedAt: row.openedAt?.toISOString() ?? null,
  };
}

function parseIssue(input: unknown) {
  const value = input as { title?: unknown; url?: unknown } | null;
  if (
    typeof value?.title !== "string" ||
    !value.title.trim() ||
    value.title.length > MAX_TITLE_LENGTH ||
    typeof value.url !== "string"
  ) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(value.url);
  } catch {
    return null;
  }

  const match = /^\/([^/]+)\/([^/]+)\/issues\/(\d+)\/?$/.exec(url.pathname);
  const issueNumber = Number(match?.[3]);
  if (url.protocol !== "https:" || url.hostname !== "github.com" || !match || !issueNumber) {
    return null;
  }

  const repositoryFullName = `${match[1]}/${match[2]}`;
  return {
    repositoryFullName,
    issueNumber,
    issueUrl: `https://github.com/${repositoryFullName}/issues/${issueNumber}`,
    title: value.title.trim(),
  };
}

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const rows = await getDatabase()
    .select()
    .from(opportunity)
    .where(eq(opportunity.userId, session.user.id))
    .orderBy(desc(opportunity.updatedAt));

  return Response.json({ opportunities: rows.map(serializeOpportunity) });
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const input = body as { action?: unknown; issue?: unknown } | null;
  const action = input?.action as OpportunityAction;
  const issue = parseIssue(input?.issue);
  if (!issue || !["open", "save", "unsave"].includes(action)) {
    return Response.json({ error: "Invalid opportunity." }, { status: 400 });
  }

  const database = getDatabase();
  const identity = and(
    eq(opportunity.userId, session.user.id),
    eq(opportunity.repositoryFullName, issue.repositoryFullName),
    eq(opportunity.issueNumber, issue.issueNumber),
  );

  if (action === "unsave") {
    await database
      .update(opportunity)
      .set({ savedAt: null })
      .where(identity);
    await database
      .delete(opportunity)
      .where(and(identity, isNull(opportunity.openedAt)));
  } else {
    const now = new Date();
    await database
      .insert(opportunity)
      .values({
        id: crypto.randomUUID(),
        userId: session.user.id,
        ...issue,
        savedAt: action === "save" ? now : null,
        openedAt: action === "open" ? now : null,
      })
      .onConflictDoUpdate({
        target: [
          opportunity.userId,
          opportunity.repositoryFullName,
          opportunity.issueNumber,
        ],
        set: {
          issueUrl: issue.issueUrl,
          title: issue.title,
          savedAt:
            action === "save" ? now : sql`${opportunity.savedAt}`,
          openedAt:
            action === "open" ? now : sql`${opportunity.openedAt}`,
          updatedAt: now,
        },
      });
  }

  const [updated] = await database
    .select()
    .from(opportunity)
    .where(identity)
    .limit(1);

  return Response.json({
    opportunity: updated ? serializeOpportunity(updated) : null,
  });
}
