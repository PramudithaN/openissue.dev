import "server-only";

import { createHash } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import {
  buildWeeklyDigest,
  getWeekStart,
  sendWeeklyDigest,
  type DigestTrend,
} from "@/features/issues/server/weekly-digest";
import {
  digestTrendSnapshot,
  repositoryDigestRepository,
  repositoryDigestTemplate,
  savedSearch,
  user,
} from "@/lib/auth-schema";
import { buildRepositoryDigest } from "@/features/issues/server/repository-digest";
import type { getDatabase } from "@/lib/db";

type Database = ReturnType<typeof getDatabase>;

export type DigestDeliveryOptions = {
  includeSavedSearches?: boolean;
  includeRepositoryAlerts?: boolean;
};

const FREQUENCY_INTERVAL_MS = {
  daily: 20 * 60 * 60 * 1000,
  weekly: (6 * 24 + 20) * 60 * 60 * 1000,
  fortnightly: (13 * 24 + 20) * 60 * 60 * 1000,
} as const;

export function isRepositoryAlertDue(
  frequency: keyof typeof FREQUENCY_INTERVAL_MS,
  lastSentAt: Date | null,
  now = new Date(),
) {
  return (
    !lastSentAt ||
    lastSentAt.getTime() <= now.getTime() - FREQUENCY_INTERVAL_MS[frequency]
  );
}

export async function getRepositoryAlertSchedule(
  database: Database,
  userId: string,
) {
  const [template] = await database
    .select({
      enabled: repositoryDigestTemplate.enabled,
      frequency: repositoryDigestTemplate.frequency,
      lastSentAt: repositoryDigestTemplate.lastSentAt,
    })
    .from(repositoryDigestTemplate)
    .where(eq(repositoryDigestTemplate.userId, userId))
    .limit(1);

  return template ?? null;
}

export async function getDigestContext(database: Database) {
  const weekStart = getWeekStart();
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);
  const previousWeekStart = new Date(weekStart);
  previousWeekStart.setUTCDate(previousWeekStart.getUTCDate() - 7);
  const previousTrendRows = await database
    .select()
    .from(digestTrendSnapshot)
    .where(eq(digestTrendSnapshot.weekStart, previousWeekStart));

  return {
    weekStart,
    previousTrends: new Map<string, DigestTrend>(
      previousTrendRows.map((trend) => [trend.searchKey, trend]),
    ),
  };
}

async function getDigestSources(
  database: Database,
  userId: string,
  options: DigestDeliveryOptions,
) {
  const searchesPromise = options.includeSavedSearches
    ? database.select().from(savedSearch).where(eq(savedSearch.userId, userId))
    : Promise.resolve([]);
  const templatePromise = options.includeRepositoryAlerts
    ? database
        .select({ id: repositoryDigestTemplate.id })
        .from(repositoryDigestTemplate)
        .where(
          and(
            eq(repositoryDigestTemplate.userId, userId),
            eq(repositoryDigestTemplate.enabled, true),
          ),
        )
        .limit(1)
    : Promise.resolve([]);
  const [searches, [template]] = await Promise.all([searchesPromise, templatePromise]);
  const repositories = template
    ? await database
        .select({
          id: repositoryDigestRepository.id,
          fullName: repositoryDigestRepository.repositoryFullName,
          url: repositoryDigestRepository.repositoryUrl,
          lastIssueIds: repositoryDigestRepository.lastIssueIds,
        })
        .from(repositoryDigestRepository)
        .where(eq(repositoryDigestRepository.templateId, template.id))
        .orderBy(asc(repositoryDigestRepository.position))
    : [];

  return { searches, template, repositories };
}

export async function deliverWeeklyDigest(
  database: Database,
  recipient: { id: string; email: string; alertEmail?: string | null },
  context: Awaited<ReturnType<typeof getDigestContext>>,
  baseUrl: string,
  options: DigestDeliveryOptions = {},
) {
  const { searches, template, repositories } = await getDigestSources(
    database,
    recipient.id,
    {
      includeSavedSearches: options.includeSavedSearches ?? true,
      includeRepositoryAlerts: options.includeRepositoryAlerts ?? true,
    },
  );

  if (!searches.length && !repositories.length) return false;

  const digest = searches.length
    ? await buildWeeklyDigest(
        searches.map((search) => ({
          ...search,
          createdAt: search.createdAt.toISOString(),
        })),
        baseUrl,
        context.previousTrends,
        context.weekStart,
      )
    : { subject: "Your repository alerts", html: "", issueCount: 0, trends: [] };
  const repositoryDigest = repositories.length
    ? await buildRepositoryDigest(repositories)
    : null;

  if (!searches.length && repositoryDigest && !repositoryDigest.changed) {
    return false;
  }

  for (const trend of digest.trends) {
    const id = createHash("sha256")
      .update(`${trend.searchKey}:${trend.weekStart.toISOString()}`)
      .digest("hex");

    await database
      .insert(digestTrendSnapshot)
      .values({ id, ...trend })
      .onConflictDoNothing();
  }

  await sendWeeklyDigest({
    to: recipient.alertEmail ?? recipient.email,
    subject: repositoryDigest
      ? `${digest.issueCount + repositoryDigest.issueCount} open-source issues for you this week`
      : digest.subject,
    html: repositoryDigest
      ? `${digest.html}${repositoryDigest.html}`
      : digest.html,
  });
  for (const snapshot of repositoryDigest?.snapshots ?? []) {
    await database
      .update(repositoryDigestRepository)
      .set({ lastIssueIds: snapshot.issueIds })
      .where(eq(repositoryDigestRepository.id, snapshot.id));
  }
  const sentAt = new Date();
  if (searches.length) {
    await database
      .update(user)
      .set({ weeklyDigestLastSentAt: sentAt })
      .where(eq(user.id, recipient.id));
  }
  if (template && repositoryDigest) {
    await database
      .update(repositoryDigestTemplate)
      .set({ lastSentAt: sentAt })
      .where(eq(repositoryDigestTemplate.id, template.id));
  }

  return true;
}
