import type { ContributionHistoryResponse } from "@/features/issues/types/contribution";

export async function getContributionHistory(page = 1) {
  const response = await fetch(`/api/contributions?page=${page}`);
  const payload = (await response.json()) as ContributionHistoryResponse;

  if (!response.ok) {
    throw new Error(payload.error ?? "Unable to load contribution history.");
  }

  return payload;
}
