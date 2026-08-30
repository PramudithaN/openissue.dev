import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, select, from, where, limit, getGitHubContributionHistory } =
  vi.hoisted(() => ({
    getSession: vi.fn(),
    select: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    getGitHubContributionHistory: vi.fn(),
  }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/db", () => ({ getDatabase: () => ({ select }) }));
vi.mock("@/features/issues/server/github-contributions", () => ({
  getGitHubContributionHistory,
}));

import { GET } from "@/app/api/contributions/route";

describe("contribution history API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    limit.mockReset();
    getSession.mockResolvedValue({ user: { id: "user-1" } });
    select.mockReturnValue({ from });
    from.mockReturnValue({ where });
    where.mockReturnValue({ limit });
    limit.mockResolvedValueOnce([{ accessToken: "oauth-token" }]);
    getGitHubContributionHistory.mockResolvedValue({
      contributions: [],
      totalCount: 0,
      page: 1,
      hasMore: false,
    });
  });

  it("requires authentication", async () => {
    getSession.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost/api/contributions"))).status).toBe(401);
  });

  it("validates pagination", async () => {
    expect(
      (await GET(new Request("http://localhost/api/contributions?page=0"))).status,
    ).toBe(400);
    expect(select).not.toHaveBeenCalled();
  });

  it("uses the signed-in user's GitHub token", async () => {
    const response = await GET(
      new Request("http://localhost/api/contributions?page=2"),
    );
    expect(response.status).toBe(200);
    expect(getGitHubContributionHistory).toHaveBeenCalledWith("oauth-token", 2);
  });

  it("links exact authored issues to tracked opportunities", async () => {
    const issueUrl = "https://github.com/acme/widgets/issues/12";
    const openedIssueUrl = "https://github.com/acme/widgets/issues/13";
    getGitHubContributionHistory.mockResolvedValueOnce({
      contributions: [
        {
          id: issueUrl,
          type: "issue",
          title: "Improve widgets",
          url: issueUrl,
          repository: "acme/widgets",
          repositoryUrl: "https://github.com/acme/widgets",
          status: "open",
          createdAt: "2026-08-01T00:00:00Z",
          updatedAt: "2026-08-20T00:00:00Z",
          opportunity: null,
        },
        {
          id: openedIssueUrl,
          type: "issue",
          title: "Open widget docs",
          url: openedIssueUrl,
          repository: "acme/widgets",
          repositoryUrl: "https://github.com/acme/widgets",
          status: "open",
          createdAt: "2026-08-02T00:00:00Z",
          updatedAt: "2026-08-21T00:00:00Z",
          opportunity: null,
        },
      ],
      totalCount: 2,
      page: 1,
      hasMore: false,
    });
    where
      .mockReturnValueOnce({ limit })
      .mockResolvedValueOnce([
        {
          issueUrl,
          savedAt: new Date("2026-08-10T00:00:00Z"),
          openedAt: null,
        },
        {
          issueUrl: openedIssueUrl,
          savedAt: null,
          openedAt: new Date("2026-08-11T00:00:00Z"),
        },
      ]);

    const payload = await (
      await GET(new Request("http://localhost/api/contributions"))
    ).json();
    expect(payload.contributions[0].opportunity).toEqual({
      savedAt: "2026-08-10T00:00:00.000Z",
      openedAt: null,
    });
    expect(payload.contributions[1].opportunity).toEqual({
      savedAt: null,
      openedAt: "2026-08-11T00:00:00.000Z",
    });
  });

  it("does not correlate pull requests by number alone", async () => {
    const pullRequestUrl = "https://github.com/acme/widgets/pull/12";
    getGitHubContributionHistory.mockResolvedValueOnce({
      contributions: [
        {
          id: pullRequestUrl,
          type: "pull-request",
          title: "Improve widgets",
          url: pullRequestUrl,
          repository: "acme/widgets",
          repositoryUrl: "https://github.com/acme/widgets",
          status: "open",
          createdAt: "2026-08-01T00:00:00Z",
          updatedAt: "2026-08-20T00:00:00Z",
          opportunity: null,
        },
      ],
      totalCount: 1,
      page: 1,
      hasMore: false,
    });

    const payload = await (
      await GET(new Request("http://localhost/api/contributions"))
    ).json();
    expect(payload.contributions[0].opportunity).toBeNull();
    expect(select).toHaveBeenCalledOnce();
  });

  it("requires a connected GitHub token", async () => {
    limit.mockReset();
    limit.mockResolvedValueOnce([]);
    expect((await GET(new Request("http://localhost/api/contributions"))).status).toBe(409);
  });

  it("converts GitHub failures to a gateway error", async () => {
    getGitHubContributionHistory.mockRejectedValueOnce(new Error("GitHub unavailable"));
    expect((await GET(new Request("http://localhost/api/contributions"))).status).toBe(502);
  });
});
