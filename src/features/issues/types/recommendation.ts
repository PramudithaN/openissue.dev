import type { Issue } from "@/features/issues/types/search";

export type RecommendedIssue = {
  issue: Issue;
  recommendationScore: number;
  matchSignals: string[];
};

export type RecommendationResponse = {
  recommendations: RecommendedIssue[];
  preferenceCount: number;
  error?: string;
};
