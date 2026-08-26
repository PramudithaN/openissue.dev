import "server-only";

import { getRecentRepositoryIssues } from "@/features/issues/server/github-search";

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

export async function buildRepositoryDigest(
  repositories: RepositoryDigestSelection[],
) {
  const results = await Promise.all(
    repositories.map(async (repository) => ({
      repository,
      issues: await getRecentRepositoryIssues(repository.fullName),
    })),
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
    .map(({ repository, issues }) => {
      const issueItems = issues.length
        ? issues
            .map((issue) => {
              const details = [
                new Date(issue.createdAt).toLocaleDateString("en", {
                  timeZone: "UTC",
                  dateStyle: "medium",
                }),
                `${issue.comments} comments`,
                issue.assigned ? "assigned" : "unassigned",
                issue.labels.length ? issue.labels.join(", ") : "no labels",
              ].join(" · ");

              return `<li><p><a href="${escapeHtml(issue.url)}"><strong>${escapeHtml(issue.title)}</strong></a></p><p>${escapeHtml(issue.summary)}</p><small>${escapeHtml(details)}</small></li>`;
            })
            .join("")
        : "<li>No open issues found.</li>";

      return `<h3><a href="${escapeHtml(repository.url)}">${escapeHtml(repository.fullName)}</a></h3><ol>${issueItems}</ol>`;
    })
    .join("");

  return {
    changed,
    issueCount,
    snapshots,
    html: `<h2>Your repository alerts</h2>${sections}`,
  };
}
