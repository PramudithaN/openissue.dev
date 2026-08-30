import type {
  GitHubRepo,
  RepositoryHealth,
} from "@/features/issues/types/search";

const DAY_IN_MILLISECONDS = 1000 * 60 * 60 * 24;

function logarithmicScore(value: number, maximum: number) {
  return Math.min(maximum, Math.log10(Math.max(0, value) + 1) * 5);
}

function getDaysSincePush(pushedAt: string | null | undefined, now: number) {
  if (!pushedAt) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(
    0,
    (now - new Date(pushedAt).getTime()) / DAY_IN_MILLISECONDS,
  );
}

function getRecencyScore(daysSincePush: number) {
  if (daysSincePush <= 30) return 40;
  if (daysSincePush <= 90) return 30;
  if (daysSincePush <= 180) return 20;
  if (daysSincePush <= 365) return 10;
  return 0;
}

function getHealthLabel(score: number): RepositoryHealth["label"] {
  if (score >= 70) return "active";
  if (score >= 40) return "moderate";
  return "stale";
}

function getPushSignal(daysSincePush: number) {
  if (daysSincePush <= 30) {
    return "Pushed within 30 days";
  }

  if (daysSincePush <= 365) {
    return `Last push ${Math.round(daysSincePush)} days ago`;
  }

  return "No push within a year";
}

export function scoreRepositoryHealth(
  repository?: GitHubRepo,
  now = Date.now(),
): RepositoryHealth {
  if (!repository) {
    return {
      score: null,
      label: "unknown",
      signals: ["Repository metadata unavailable"],
    };
  }

  const daysSincePush = getDaysSincePush(repository.pushed_at, now);
  const recencyScore = getRecencyScore(daysSincePush);
  const openActivityScore = Math.min(
    15,
    Math.log10((repository.open_issues_count ?? 0) + 1) * 6,
  );
  const starScore = logarithmicScore(repository.stargazers_count, 20);
  const forkScore = logarithmicScore(repository.forks_count ?? 0, 15);
  const issueTrackerScore = repository.has_issues === false ? 0 : 10;
  const score = Math.round(
    recencyScore +
      openActivityScore +
      starScore +
      forkScore +
      issueTrackerScore,
  );
  const label = getHealthLabel(score);
  const signals = [
    getPushSignal(daysSincePush),
    `${repository.open_issues_count ?? 0} open issues and pull requests`,
    `${repository.forks_count ?? 0} forks`,
    repository.has_issues === false
      ? "Issue tracker disabled"
      : "Issue tracker enabled",
  ];

  return { score, label, signals };
}
