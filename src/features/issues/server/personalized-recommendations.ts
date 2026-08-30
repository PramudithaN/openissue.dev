import "server-only";
import { searchGitHubIssues } from "@/features/issues/server/github-search";
import type { SavedSearch } from "@/features/issues/lib/saved-searches";
import type { RecommendedIssue } from "@/features/issues/types/recommendation";

const MAX_PREFERENCES = 1;
const MAX_RECOMMENDATIONS = 24;
const PREFERENCE_MATCH_SCORE = 12;
const FAMILIAR_REPOSITORY_SCORE = 4;

export async function buildPersonalizedRecommendations(
  savedSearches: SavedSearch[],
  opportunities: Array<{ issueUrl: string; repositoryFullName: string }>,
): Promise<{ recommendations: RecommendedIssue[]; preferenceCount: number }> {
  const distinctPreferences = new Map<string, SavedSearch>();

  for (const search of [...savedSearches].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  )) {
    const key = `${search.tech.trim().toLowerCase()}\0${search.label.toLowerCase()}`;
    if (!distinctPreferences.has(key)) distinctPreferences.set(key, search);
  }

  const preferences = Array.from(distinctPreferences.values()).slice(
    0,
    MAX_PREFERENCES,
  );

  if (preferences.length === 0) {
    return { recommendations: [], preferenceCount: 0 };
  }

  const results = await Promise.all(
    preferences.map((preference) =>
      searchGitHubIssues({
        tech: preference.tech,
        label: preference.label,
        sort: "updated",
        linkedPr: "any",
        hacktoberfest: "any",
      }),
    ),
  );
  const excludedUrls = new Set(opportunities.map((item) => item.issueUrl));
  const familiarRepositories = new Set(
    opportunities.map((item) => item.repositoryFullName.toLowerCase()),
  );
  const recommendations = new Map<string, RecommendedIssue>();

  results.forEach((result, index) => {
    const preference = preferences[index];

    for (const issue of result.issues) {
      if (excludedUrls.has(issue.url)) continue;

      const current = recommendations.get(issue.id) ?? {
        issue,
        recommendationScore: issue.qualityScore,
        matchSignals: [],
      };
      const signals = [
        `Technology: ${preference.tech}`,
        `Label: ${preference.label}`,
      ];

      for (const signal of signals) {
        if (!current.matchSignals.includes(signal)) {
          current.matchSignals.push(signal);
          current.recommendationScore += PREFERENCE_MATCH_SCORE;
        }
      }

      if (
        familiarRepositories.has(issue.repo.toLowerCase()) &&
        !current.matchSignals.includes("Familiar repository")
      ) {
        current.matchSignals.push("Familiar repository");
        current.recommendationScore += FAMILIAR_REPOSITORY_SCORE;
      }

      recommendations.set(issue.id, current);
    }
  });

  return {
    preferenceCount: preferences.length,
    recommendations: Array.from(recommendations.values())
      .sort(
        (a, b) =>
          b.recommendationScore - a.recommendationScore ||
          Date.parse(b.issue.updatedAt) - Date.parse(a.issue.updatedAt),
      )
      .slice(0, MAX_RECOMMENDATIONS),
  };
}
