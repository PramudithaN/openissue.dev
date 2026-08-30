import "server-only";

import {
  getRecentRepositoryIssues,
  getRepositoryResponsiveness,
} from "@/features/issues/server/github-search";
import { unknownRepositoryResponsiveness } from "@/features/issues/lib/repository-responsiveness";

export type RepositoryDigestSelection = {
  id: string;
  fullName: string;
  url: string;
  lastIssueIds: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function issueCard(issue: Awaited<ReturnType<typeof getRecentRepositoryIssues>>[number]) {
  const date = new Date(issue.createdAt).toLocaleDateString("en", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
  const assignmentColor = issue.assigned ? "#fbbf24" : "#6b7280";
  const labels = issue.labels
    .map(
      (label) =>
        `<span style="display:inline-block;font-size:10.5px;font-weight:600;color:#a78bfa;background-color:#1e1a33;border:1px solid #362a5c;padding:2px 8px;border-radius:10px;margin:0 4px 4px 0;">${escapeHtml(label)}</span>`,
    )
    .join("");
  const labelRow = labels
    ? `<tr><td style="padding-top:8px;">${labels}</td></tr>`
    : "";

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#161b26;border-radius:8px;margin-bottom:10px;"><tr><td style="padding:14px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td><a href="${escapeHtml(issue.url)}" class="issue-title-mobile" style="font-size:14.5px;font-weight:700;color:#f4f5f7;line-height:1.4;text-decoration:none;">${escapeHtml(issue.title)}</a></td></tr><tr><td style="padding-top:6px;"><p style="margin:0;font-size:13px;line-height:1.55;color:#9ca3af;">${escapeHtml(issue.summary)}</p></td></tr><tr><td style="padding-top:10px;"><span style="font-size:11px;color:#6b7280;">${escapeHtml(date)} · ${issue.comments} ${issue.comments === 1 ? "comment" : "comments"} · </span><span style="font-size:11px;color:${assignmentColor};font-weight:600;">${issue.assigned ? "assigned" : "unassigned"}</span></td></tr>${labelRow}</table></td></tr></table>`;
}

export async function buildRepositoryDigest(
  repositories: RepositoryDigestSelection[],
) {
  const results = await Promise.all(
    repositories.map(async (repository) => {
      const [issues, responsiveness] = await Promise.all([
        getRecentRepositoryIssues(repository.fullName),
        getRepositoryResponsiveness(repository.fullName).catch(() =>
          unknownRepositoryResponsiveness(),
        ),
      ]);

      return { repository, issues, responsiveness };
    }),
  );
  const snapshots = results.map(({ repository, issues }) => ({
    id: repository.id,
    issueIds: JSON.stringify(issues.map((issue) => issue.id)),
  }));
  const changed = results.some(
    ({ repository }, index) => repository.lastIssueIds !== snapshots[index].issueIds,
  );
  const issueCount = results.reduce((count, result) => count + result.issues.length, 0);
  const sections = results
    .map(({ repository, issues, responsiveness }) => {
      const issueItems = issues.length
        ? issues.map(issueCard).join("")
        : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#161b26;border-radius:8px;"><tr><td style="padding:14px 16px;font-size:13px;color:#9ca3af;">No open issues found.</td></tr></table>`;
      const issueLabel = `${issues.length} ${issues.length === 1 ? "issue" : "issues"}`;
      const responsivenessLabel = `${responsiveness.status[0].toUpperCase()}${responsiveness.status.slice(1)}`;
      const responsivenessSignals = responsiveness.signals
        .map((signal) => escapeHtml(signal))
        .join(" · ");
      const responsivenessSummary = `<p style="margin:8px 0 0;font-size:12px;line-height:1.5;color:#9ca3af;"><strong style="color:#d1d5db;">${escapeHtml(responsivenessLabel)} maintainer responsiveness</strong> · ${responsiveness.sampleSize} samples over ${responsiveness.sampleDays} days<br>${responsivenessSignals}</p>`;

      return `<tr><td class="mobile-pad" style="padding:24px 32px 14px 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td><a href="${escapeHtml(repository.url)}" class="repo-head-mobile" style="font-size:16px;font-weight:700;color:#f4f5f7;text-decoration:none;">📦 ${escapeHtml(repository.fullName)}</a></td><td align="right"><span style="font-size:12px;color:#6b7280;font-weight:600;">${issueLabel}</span></td></tr></table>${responsivenessSummary}</td></tr><tr><td class="mobile-pad" style="padding:0 32px;">${issueItems}</td></tr><tr><td class="mobile-pad" style="padding:18px 32px 0 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid #1f2530;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>`;
    })
    .join("");

  return {
    changed,
    issueCount,
    repositoryCount: results.length,
    snapshots,
    html: sections,
  };
}
