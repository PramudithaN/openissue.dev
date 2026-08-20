import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteCloudSavedSearch,
  syncSavedSearches,
} from "@/features/issues/lib/saved-search-cloud";

const search = {
  id: "saved-1",
  name: "React help",
  tech: "React",
  label: "help-wanted",
  sort: "updated",
  linkedPr: "any",
  hacktoberfest: "any",
  createdAt: "2026-08-19T00:00:00.000Z",
};

describe("saved search cloud client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("syncs local searches and returns the merged account list", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ searches: [search] }), { status: 200 }),
    );

    await expect(syncSavedSearches([search])).resolves.toEqual([search]);
    expect(fetch).toHaveBeenCalledWith(
      "/api/saved-searches",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ searches: [search] }),
      }),
    );
  });

  it("deletes a saved search from the account", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    await deleteCloudSavedSearch("saved/search");
    expect(fetch).toHaveBeenCalledWith("/api/saved-searches/saved%2Fsearch", {
      method: "DELETE",
    });
  });

  it("uploads large local collections in server-safe batches", async () => {
    const searches = Array.from({ length: 101 }, (_, index) => ({
      ...search,
      id: `saved-${index}`,
    }));
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ searches: searches.slice(0, 100) }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ searches }), { status: 200 }),
      );

    await expect(syncSavedSearches(searches)).resolves.toEqual(searches);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string).searches,
    ).toHaveLength(100);
    expect(
      JSON.parse(vi.mocked(fetch).mock.calls[1][1]?.body as string).searches,
    ).toHaveLength(1);
  });

  it("reports failed sync and delete requests", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));

    await expect(syncSavedSearches([])).rejects.toThrow(
      "Unable to sync saved searches.",
    );
    await expect(deleteCloudSavedSearch("saved-1")).rejects.toThrow(
      "Unable to remove the saved search from your account.",
    );
  });
});
