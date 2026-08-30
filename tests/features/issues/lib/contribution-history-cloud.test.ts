import { afterEach, describe, expect, it, vi } from "vitest";
import { getContributionHistory } from "@/features/issues/lib/contribution-history-cloud";

afterEach(() => vi.restoreAllMocks());

describe("contribution history cloud client", () => {
  it("loads the requested contribution page", async () => {
    const payload = {
      contributions: [],
      totalCount: 0,
      page: 2,
      hasMore: false,
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(payload));

    await expect(getContributionHistory(2)).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith("/api/contributions?page=2");
  });

  it("uses the first page by default", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        contributions: [],
        totalCount: 0,
        page: 1,
        hasMore: false,
      }),
    );

    await getContributionHistory();
    expect(fetchMock).toHaveBeenCalledWith("/api/contributions?page=1");
  });

  it("surfaces API and fallback errors", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        Response.json({ error: "GitHub unavailable." }, { status: 503 }),
      )
      .mockResolvedValueOnce(Response.json({}, { status: 500 }));

    await expect(getContributionHistory()).rejects.toThrow(
      "GitHub unavailable.",
    );
    await expect(getContributionHistory()).rejects.toThrow(
      "Unable to load contribution history.",
    );
  });
});
