import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getGitHubContributionHistory } from "@/features/issues/server/github-contributions";

describe("getGitHubContributionHistory", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("maps issues and pull requests with their current status", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ login: "octocat" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            total_count: 31,
            items: [
              {
                html_url: "https://github.com/acme/widgets/issues/1",
                title: "Document widgets",
                state: "open",
                created_at: "2026-08-01T00:00:00Z",
                updated_at: "2026-08-20T00:00:00Z",
                repository_url: "https://api.github.com/repos/acme/widgets",
              },
              {
                html_url: "https://github.com/acme/widgets/pull/2",
                title: "Add widget docs",
                state: "closed",
                created_at: "2026-08-02T00:00:00Z",
                updated_at: "2026-08-21T00:00:00Z",
                repository_url: "https://api.github.com/repos/acme/widgets",
                pull_request: { merged_at: "2026-08-21T00:00:00Z" },
              },
              {
                html_url: "https://github.com/acme/widgets/pull/3",
                title: "Draft widget fix",
                state: "open",
                draft: true,
                created_at: "2026-08-03T00:00:00Z",
                updated_at: "2026-08-22T00:00:00Z",
                repository_url: "https://api.github.com/repos/acme/widgets",
                pull_request: { merged_at: null },
              },
              {
                html_url: "https://github.com/acme/widgets/issues/4",
                title: "Retired widget task",
                state: "closed",
                created_at: "2026-08-04T00:00:00Z",
                updated_at: "2026-08-23T00:00:00Z",
                repository_url: "acme/widgets",
              },
            ],
          }),
          { status: 200 },
        ),
      );

    const history = await getGitHubContributionHistory("oauth-token", 1);

    expect(history).toEqual(
      expect.objectContaining({
        totalCount: 31,
        page: 1,
        hasMore: true,
        contributions: [
          expect.objectContaining({
            type: "issue",
            status: "open",
            opportunity: null,
          }),
          expect.objectContaining({
            type: "pull-request",
            status: "merged",
            opportunity: null,
          }),
          expect.objectContaining({
            type: "pull-request",
            status: "draft",
          }),
          expect.objectContaining({
            type: "issue",
            status: "closed",
            repository: "acme/widgets",
          }),
        ],
      }),
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining("author%3Aoctocat"),
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("surfaces GitHub failures", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401 }),
    );

    await expect(
      getGitHubContributionHistory("expired-token", 1),
    ).rejects.toThrow("GitHub API error 401");
  });
});
