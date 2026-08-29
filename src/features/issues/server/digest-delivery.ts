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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderAlertEmail({
  content,
  issueCount,
  repositoryCount,
  baseUrl,
  heading = "Your repository alerts",
  summary,
}: {
  content: string;
  issueCount: number;
  repositoryCount: number;
  baseUrl: string;
  heading?: string;
  summary?: string;
}) {
  const issueLabel = `${issueCount} ${issueCount === 1 ? "ISSUE" : "ISSUES"}`;
  const repositoryLabel = `${repositoryCount} ${repositoryCount === 1 ? "repository" : "repositories"}`;
  const safeBaseUrl = escapeHtml(baseUrl);
  const iconUrl = escapeHtml(new URL("/openissue-logo.png", baseUrl).toString());
  const safeHeading = escapeHtml(heading);
  const activitySummary = summary
    ? escapeHtml(summary)
    : `<strong style="color:#d1d5db;">${repositoryLabel}</strong> you watch have new activity`;

  return `<!DOCTYPE html><html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><meta http-equiv="X-UA-Compatible" content="IE=edge"><title>${safeHeading}</title><style>body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table,td{mso-table-lspace:0;mso-table-rspace:0}img{-ms-interpolation-mode:bicubic;border:0;height:auto;line-height:100%;outline:none;text-decoration:none}body{margin:0;padding:0;width:100%!important;background-color:#0a0e14}a{text-decoration:none}@media screen and (max-width:600px){.email-container{width:95%!important}.mobile-pad{padding-left:18px!important;padding-right:18px!important}.headline-mobile{font-size:20px!important}.issue-title-mobile,.repo-head-mobile{font-size:15px!important}}</style></head><body style="margin:0;padding:0;background-color:#0a0e14;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;"><div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${issueCount} new open-source issues.</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0a0e14;"><tr><td align="center" style="padding:32px 0;"><table role="presentation" class="email-container" width="95%" cellpadding="0" cellspacing="0" border="0" style="width:95%;background-color:#12161f;border-radius:12px;overflow:hidden;border:1px solid #1f2530;"><tr><td style="background:linear-gradient(90deg,#7dd3fc 0%,#a78bfa 50%,#34d399 100%);height:4px;line-height:4px;font-size:0;">&nbsp;</td></tr><tr><td class="mobile-pad" style="padding:28px 32px 0 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-right:9px;"><img src="${iconUrl}" width="28" height="28" alt="OpenIssue.dev" style="display:block;width:28px;height:28px;border-radius:7px;"></td><td style="font-size:14px;color:#6b7280;font-weight:600;letter-spacing:.5px;">OPENISSUE<span style="color:#34d399;">.DEV</span></td></tr></table></td><td align="right"><span style="display:inline-block;background-color:#131b2e;color:#7dd3fc;border:1px solid #2a3a5c;font-size:12px;font-weight:700;letter-spacing:.8px;padding:5px 12px;border-radius:20px;">${issueLabel}</span></td></tr></table></td></tr><tr><td class="mobile-pad" style="padding:20px 32px 4px 32px;"><h1 class="headline-mobile" style="margin:0;font-size:24px;line-height:1.3;color:#f4f5f7;font-weight:700;">${safeHeading}</h1></td></tr><tr><td class="mobile-pad" style="padding:8px 32px 24px 32px;"><p style="margin:0;font-size:14px;line-height:1.6;color:#9ca3af;">${activitySummary}</p></td></tr><tr><td class="mobile-pad" style="padding:0 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid #1f2530;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>${content}<tr><td class="mobile-pad" style="padding:30px 32px 8px 32px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td align="center" style="border-radius:8px;background-color:#7dd3fc;"><a href="${safeBaseUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#0a0e14;letter-spacing:.3px;">View All ${issueCount} Issues →</a></td></tr></table></td></tr><tr><td class="mobile-pad" align="center" style="padding:18px 32px 28px 32px;"><p style="margin:0;font-size:12px;line-height:1.6;color:#4b5563;">OpenIssue.dev &nbsp;•&nbsp; <a href="${safeBaseUrl}" style="color:#6b7280;">Manage alerts</a></p></td></tr></table></td></tr></table></body></html>`;
}

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
  const repositorySourcePromise = options.includeRepositoryAlerts
    ? getRepositoryDigestSource(database, userId)
    : Promise.resolve({ template: undefined, repositories: [] });
  const [searches, repositorySource] = await Promise.all([
    searchesPromise,
    repositorySourcePromise,
  ]);

  return { searches, ...repositorySource };
}

export async function getRepositoryDigestSource(
  database: Database,
  userId: string,
  enabledOnly = true,
) {
  const templateCondition = enabledOnly
    ? and(
        eq(repositoryDigestTemplate.userId, userId),
        eq(repositoryDigestTemplate.enabled, true),
      )
    : eq(repositoryDigestTemplate.userId, userId);
  const [template] = await database
    .select({ id: repositoryDigestTemplate.id })
    .from(repositoryDigestTemplate)
    .where(templateCondition)
    .limit(1);
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

  return { template, repositories };
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

  const savedSearchContent = searches.length
    ? `<tr><td class="mobile-pad" style="padding:24px 32px 0 32px;color:#d1d5db;">${digest.html}</td></tr>`
    : "";
  const repositoryContent = repositoryDigest
    ? savedSearchContent + repositoryDigest.html
    : digest.html;

  await sendWeeklyDigest({
    to: recipient.alertEmail ?? recipient.email,
    subject: repositoryDigest
      ? `${digest.issueCount + repositoryDigest.issueCount} open-source issues for you this week`
      : digest.subject,
    html: repositoryDigest
      ? renderAlertEmail({
          content: repositoryContent,
          issueCount: digest.issueCount + repositoryDigest.issueCount,
          repositoryCount: repositoryDigest.repositoryCount,
          baseUrl,
        })
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
