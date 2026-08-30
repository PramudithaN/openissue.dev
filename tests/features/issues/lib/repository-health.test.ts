import { describe, expect, it } from "vitest";
import { scoreRepositoryHealth } from "@/features/issues/lib/repository-health";
import type { GitHubRepo } from "@/features/issues/types/search";

function repository(overrides: Partial<GitHubRepo> = {}): GitHubRepo {
  return {
    full_name: "acme/widgets",
    html_url: "https://github.com/acme/widgets",
    stargazers_count: 5000,
    forks_count: 500,
    open_issues_count: 100,
    has_issues: true,
    pushed_at: "2026-08-20T00:00:00.000Z",
    archived: false,
    ...overrides,
  };
}

describe("repository health", () => {
  const now = new Date("2026-08-30T00:00:00.000Z").getTime();

  it("identifies active repositories from multiple health signals", () => {
    const health = scoreRepositoryHealth(repository(), now);

    expect(health.label).toBe("active");
    expect(health.score).toBeGreaterThanOrEqual(70);
    expect(health.signals).toContain("Pushed within 30 days");
  });

  it("distinguishes stale repositories", () => {
    const health = scoreRepositoryHealth(
      repository({
        pushed_at: "2024-01-01T00:00:00.000Z",
        stargazers_count: 0,
        forks_count: 0,
        open_issues_count: 0,
        has_issues: false,
      }),
      now,
    );

    expect(health).toMatchObject({ score: 0, label: "stale" });
    expect(health.signals).toContain("Issue tracker disabled");
  });

  it.each([
    ["2026-07-01T00:00:00.000Z", 40, "moderate"],
    ["2026-05-02T00:00:00.000Z", 30, "stale"],
    ["2026-01-01T00:00:00.000Z", 20, "stale"],
  ] as const)(
    "scores the intermediate push-recency bands for %s",
    (pushedAt, expectedScore, expectedLabel) => {
      const health = scoreRepositoryHealth(
        repository({
          pushed_at: pushedAt,
          stargazers_count: 0,
          forks_count: 0,
          open_issues_count: 0,
        }),
        now,
      );

      expect(health).toMatchObject({
        score: expectedScore,
        label: expectedLabel,
      });
      expect(health.signals[0]).toMatch(/^Last push \d+ days ago$/);
    },
  );

  it("handles repository metadata without optional activity fields", () => {
    const health = scoreRepositoryHealth(
      repository({
        pushed_at: null,
        stargazers_count: 0,
        forks_count: undefined,
        open_issues_count: undefined,
        has_issues: undefined,
      }),
      now,
    );

    expect(health).toMatchObject({ score: 10, label: "stale" });
    expect(health.signals).toContain("No push within a year");
  });

  it("reports unknown health when repository enrichment is unavailable", () => {
    expect(scoreRepositoryHealth(undefined, now)).toEqual({
      score: null,
      label: "unknown",
      signals: ["Repository metadata unavailable"],
    });
  });
});
