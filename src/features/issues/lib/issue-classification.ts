import type {
  GitHubIssue,
  IssueClassification,
} from "@/features/issues/types/search";

const EXPERIENCE_LABELS = {
  first: ["first timers only", "first-timers-only", "first contribution"],
  beginner: ["good first issue", "beginner", "easy"],
  intermediate: ["intermediate", "medium difficulty"],
} as const;

const TYPE_LABELS = {
  documentation: ["documentation", "docs"],
  tests: ["test", "tests", "testing"],
  bugfix: ["bug", "bugfix", "bug fix"],
  feature: ["feature", "enhancement"],
} as const;

const SMALL_SCOPE_LABELS = ["small", "small scope", "size/s", "tiny", "trivial"];

function normalizedLabels(issue: GitHubIssue) {
  return issue.labels.map((label) => label.name.trim().toLowerCase());
}

function matchingKeys<T extends string>(
  labels: string[],
  groups: Record<T, readonly string[]>,
) {
  return (Object.entries(groups) as Array<[T, readonly string[]]>)
    .filter(([, aliases]) => aliases.some((alias) => labels.includes(alias)))
    .map(([key]) => key);
}

function structuredValue(issue: GitHubIssue, field: string) {
  const lines = (issue.body ?? "").split("\n");

  for (const [index, line] of lines.entries()) {
    const normalized = line
      .trim()
      .replace(/^[-*#>\s]+/, "")
      .replaceAll("**", "");
    const separator = normalized.indexOf(":");

    if (
      separator >= 0 &&
      normalized.slice(0, separator).trim().toLowerCase() === field
    ) {
      return normalized.slice(separator + 1).trim().toLowerCase();
    }

    if (normalized.toLowerCase() !== field) continue;

    const answer = lines
      .slice(index + 1)
      .map((candidate) => candidate.trim())
      .find((candidate) => candidate && !candidate.startsWith("<!--"));
    return answer?.toLowerCase() ?? null;
  }

  return null;
}

function addStatedExperience(experience: IssueClassification["experience"], value: string | null) {
  if (value === "first contribution" && !experience.includes("first")) {
    experience.push("first");
  }

  if (
    (value === "beginner" || value === "intermediate") &&
    !experience.includes(value)
  ) {
    experience.push(value);
  }

  return (
    value === "first contribution" ||
    value === "beginner" ||
    value === "intermediate"
  );
}

function normalizeContributionType(value: string | null) {
  switch (value) {
    case "docs":
      return "documentation";
    case "test":
      return "tests";
    case "bug fix":
      return "bugfix";
    default:
      return value;
  }
}

function addStatedContributionType(
  contributionTypes: IssueClassification["contributionTypes"],
  value: string | null,
) {
  if (
    value === "documentation" ||
    value === "tests" ||
    value === "bugfix" ||
    value === "feature"
  ) {
    if (!contributionTypes.includes(value)) contributionTypes.push(value);
    return true;
  }

  return false;
}

function experienceLabelSignal(level: string) {
  if (level === "first") return "First-contribution label";
  return `${level[0].toUpperCase()}${level.slice(1)} label`;
}

function contributionTypeLabelSignal(type: string) {
  const label = type === "bugfix"
    ? "Bug fix"
    : `${type[0].toUpperCase()}${type.slice(1)}`;
  return `${label} label`;
}

export function classifyIssue(issue: GitHubIssue): IssueClassification {
  const labels = normalizedLabels(issue);
  const labeledExperience = matchingKeys(labels, EXPERIENCE_LABELS);
  const labeledContributionTypes = matchingKeys(labels, TYPE_LABELS);
  const experience = [...labeledExperience];
  const contributionTypes = [...labeledContributionTypes];
  const hasSmallScopeLabel = SMALL_SCOPE_LABELS.some((label) =>
    labels.includes(label),
  );
  const statedExperience =
    structuredValue(issue, "experience") ??
    structuredValue(issue, "experience level") ??
    structuredValue(issue, "difficulty");
  const statedType = structuredValue(issue, "contribution type");
  const statedScope =
    structuredValue(issue, "scope") ??
    structuredValue(issue, "size") ??
    structuredValue(issue, "estimated effort");

  const hasStatedExperience = addStatedExperience(experience, statedExperience);
  const normalizedType = normalizeContributionType(statedType);
  const hasStatedContributionType = addStatedContributionType(
    contributionTypes,
    normalizedType,
  );
  const hasStatedSmallScope =
    statedScope === "small" || statedScope === "s" || statedScope === "tiny";

  const smallScope =
    hasSmallScopeLabel ||
    hasStatedSmallScope;
  const signals = [
    ...labeledExperience.map(experienceLabelSignal),
    ...labeledContributionTypes.map(contributionTypeLabelSignal),
    ...(hasSmallScopeLabel ? ["Small-scope label"] : []),
  ];

  if (hasStatedExperience) signals.push("Experience stated in issue template");
  if (hasStatedContributionType) {
    signals.push("Contribution type stated in issue template");
  }
  if (hasStatedSmallScope) signals.push("Scope stated in issue template");

  return { experience, contributionTypes, smallScope, signals: [...new Set(signals)] };
}

export function matchesClassification(
  classification: IssueClassification,
  experience: string,
  contributionType: string,
  scope: string,
) {
  return (
    (experience === "any" || classification.experience.includes(experience as never)) &&
    (contributionType === "any" ||
      classification.contributionTypes.includes(contributionType as never)) &&
    (scope === "any" || classification.smallScope)
  );
}
