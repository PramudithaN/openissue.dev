import type { SavedSearch } from "@/features/issues/lib/saved-searches";

export async function syncSavedSearches(
  searches: SavedSearch[],
): Promise<SavedSearch[]> {
  const response = await fetch("/api/saved-searches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ searches }),
  });

  if (!response.ok) {
    throw new Error("Unable to sync saved searches.");
  }

  const result = (await response.json()) as { searches: SavedSearch[] };
  return result.searches;
}

export async function deleteCloudSavedSearch(id: string): Promise<void> {
  const response = await fetch(`/api/saved-searches/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Unable to remove the saved search from your account.");
  }
}
