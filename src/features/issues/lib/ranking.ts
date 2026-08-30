import type { Issue } from "@/features/issues/types/search";

export function rankIssues(issues: Issue[], sort = "quality") {
  return [...issues].sort((a, b) => {
    const scoreDifference = sort === "trending"
      ? (b.trendingScore ?? 0) - (a.trendingScore ?? 0)
      : b.qualityScore - a.qualityScore;

    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export function mergeRankedIssues(
  existingIssues: Issue[],
  incomingIssues: Issue[],
  sort = "quality",
) {
  const issueMap = new Map<string, Issue>();

  for (const issue of [...existingIssues, ...incomingIssues]) {
    issueMap.set(issue.id, issue);
  }

  return rankIssues(Array.from(issueMap.values()), sort);
}
