import { afterEach, describe, expect, it, vi } from "vitest";
import { getRecommendations } from "@/features/issues/lib/recommendation-cloud";

afterEach(() => vi.restoreAllMocks());

describe("recommendation cloud client", () => {
  it("loads the default recommendation selection", async () => {
    const payload = { recommendations: [], preferenceCount: 0 };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(payload),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getRecommendations()).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith("/api/recommendations");
  });

  it("requests the selected saved search", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ recommendations: [], preferenceCount: 1 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await getRecommendations("search id");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/recommendations?searchId=search+id",
    );
  });

  it("surfaces API and fallback errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: vi.fn().mockResolvedValue({ error: "Unauthorized." }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: vi.fn().mockResolvedValue({}),
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getRecommendations()).rejects.toThrow("Unauthorized.");
    await expect(getRecommendations()).rejects.toThrow(
      "Unable to load recommendations.",
    );
  });
});
