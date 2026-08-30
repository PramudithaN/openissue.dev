import type { RepositoryResponsiveness } from "@/features/issues/types/search";

const MAINTAINER_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
const CONTRIBUTOR_FRIENDLY_LABELS = new Set([
  "good first issue",
  "help wanted",
  "up-for-grabs",
  "first-timers-only",
]);

export type ResponsivenessIssue = {
  author?: { login: string } | null;
  closedAt?: string | null;
  createdAt: string;
  labels: { nodes: Array<{ name: string }> };
  comments: {
    nodes: Array<{
      author?: { login: string } | null;
      authorAssociation: string;
      createdAt: string;
    }>;
  };
};

export type ResponsivenessPullRequest = {
  authorAssociation: string;
  createdAt: string;
  mergedAt?: string | null;
};

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function unknownRepositoryResponsiveness(
  signal = "Responsiveness sample unavailable",
): RepositoryResponsiveness {
  return {
    status: "unknown",
    sampleDays: 90,
    sampleSize: 0,
    signals: [signal],
  };
}

export function scoreRepositoryResponsiveness(
  issues: ResponsivenessIssue[],
  pullRequests: ResponsivenessPullRequest[],
  now = Date.now(),
): RepositoryResponsiveness {
  const sampleStart = now - 90 * DAY_IN_MILLISECONDS;
  const relevantIssues = issues.filter((issue) => {
    const hasFriendlyLabel = issue.labels.nodes.some((label) =>
      CONTRIBUTOR_FRIENDLY_LABELS.has(label.name.trim().toLowerCase()),
    );
    return hasFriendlyLabel && new Date(issue.createdAt).getTime() >= sampleStart;
  });
  const responseTimes = relevantIssues.flatMap((issue) => {
    const authorLogin = issue.author?.login;
    const response = issue.comments.nodes.find(
      (comment) =>
        MAINTAINER_ASSOCIATIONS.has(comment.authorAssociation) &&
        comment.author?.login !== authorLogin,
    );
    return response
      ? [(new Date(response.createdAt).getTime() - new Date(issue.createdAt).getTime()) / DAY_IN_MILLISECONDS]
      : [];
  });
  const unansweredCount = relevantIssues.length - responseTimes.length;
  const externalPullRequests = pullRequests.filter(
    (pullRequest) =>
      !MAINTAINER_ASSOCIATIONS.has(pullRequest.authorAssociation) &&
      new Date(pullRequest.createdAt).getTime() >= sampleStart,
  );
  const mergedExternalPullRequests = externalPullRequests.filter(
    (pullRequest) => pullRequest.mergedAt,
  ).length;
  const sampleSize = relevantIssues.length + externalPullRequests.length;

  if (sampleSize < 4 || relevantIssues.length < 2) {
    return {
      ...unknownRepositoryResponsiveness("Fewer than 4 recent contribution samples"),
      sampleSize,
    };
  }

  const medianResponseDays = responseTimes.length ? median(responseTimes) : null;
  const unansweredRatio = unansweredCount / relevantIssues.length;
  const externalMergeRatio = externalPullRequests.length
    ? mergedExternalPullRequests / externalPullRequests.length
    : null;
  let status: RepositoryResponsiveness["status"] = "variable";

  if (
    medianResponseDays !== null &&
    medianResponseDays <= 3 &&
    unansweredRatio <= 0.25 &&
    (externalMergeRatio === null || externalMergeRatio >= 0.5)
  ) {
    status = "responsive";
  } else if (
    medianResponseDays === null ||
    medianResponseDays > 14 ||
    unansweredRatio > 0.6 ||
    (externalPullRequests.length >= 2 && (externalMergeRatio ?? 0) < 0.25)
  ) {
    status = "slow";
  }

  const closedIssues = relevantIssues.filter((issue) => issue.closedAt).length;
  const signals = [
    medianResponseDays === null
      ? "No maintainer response found"
      : `Median first maintainer response: ${Math.round(medianResponseDays * 10) / 10} days`,
    `${unansweredCount} of ${relevantIssues.length} contributor-friendly issues unanswered`,
    `${closedIssues} recent contributor-friendly issues closed`,
    `${mergedExternalPullRequests} of ${externalPullRequests.length} external pull requests merged`,
  ];

  return { status, sampleDays: 90, sampleSize, signals };
}

export function getResponsivenessBoost(
  status: RepositoryResponsiveness["status"],
) {
  if (status === "responsive") return 5;
  if (status === "variable") return 2;
  return 0;
}
