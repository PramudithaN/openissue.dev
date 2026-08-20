import type { SavedSearch } from "@/features/issues/lib/saved-searches";

const MAX_SEARCHES_PER_REQUEST = 100;

export async function syncSavedSearches(
  searches: SavedSearch[],
): Promise<SavedSearch[]> {
  const batches = searches.length
    ? Array.from(
        { length: Math.ceil(searches.length / MAX_SEARCHES_PER_REQUEST) },
        (_, index) =>
          searches.slice(
            index * MAX_SEARCHES_PER_REQUEST,
            (index + 1) * MAX_SEARCHES_PER_REQUEST,
          ),
      )
    : [[]];
  let syncedSearches: SavedSearch[] = [];

  for (const batch of batches) {
    const response = await fetch("/api/saved-searches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ searches: batch }),
    });

    if (!response.ok) {
      throw new Error("Unable to sync saved searches.");
    }

    const result = (await response.json()) as { searches: SavedSearch[] };
    syncedSearches = result.searches;
  }

  return syncedSearches;
}

export async function deleteCloudSavedSearch(id: string): Promise<void> {
  const response = await fetch(`/api/saved-searches/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Unable to remove the saved search from your account.");
  }
}
