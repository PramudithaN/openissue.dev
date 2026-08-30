import type { RecommendationResponse } from "@/features/issues/types/recommendation";

export async function getRecommendations(searchId?: string) {
  const params = new URLSearchParams();
  if (searchId) params.set("searchId", searchId);
  const query = params.size > 0 ? `?${params.toString()}` : "";
  const response = await fetch(`/api/recommendations${query}`);
  const payload = (await response.json()) as RecommendationResponse;

  if (!response.ok) {
    throw new Error(payload.error ?? "Unable to load recommendations.");
  }

  return payload;
}
