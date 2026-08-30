import { describe, expect, it, vi } from "vitest";
import { isSearchRateLimited } from "@/features/issues/server/search-rate-limit";

describe("search rate limiter", () => {
  it("limits the seventh request in a minute", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const key = "test:repeated";

    for (let request = 0; request < 6; request += 1) {
      expect(isSearchRateLimited(key)).toBe(false);
    }

    expect(isSearchRateLimited(key)).toBe(true);
    vi.restoreAllMocks();
  });

  it("discards requests outside the window", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const key = "test:expired";

    for (let request = 0; request < 6; request += 1) {
      isSearchRateLimited(key);
    }

    now.mockReturnValue(1_060_001);
    expect(isSearchRateLimited(key)).toBe(false);
    vi.restoreAllMocks();
  });
});
