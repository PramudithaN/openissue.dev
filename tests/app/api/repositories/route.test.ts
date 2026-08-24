import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, searchGitHubRepositories } = vi.hoisted(() => ({
  getSession: vi.fn(),
  searchGitHubRepositories: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/features/issues/server/github-search", () => ({
  searchGitHubRepositories,
}));

import { GET } from "@/app/api/repositories/route";

describe("repository autocomplete API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("requires authentication", async () => {
    getSession.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost?query=react"))).status).toBe(401);
  });

  it("validates the query", async () => {
    expect((await GET(new Request("http://localhost"))).status).toBe(400);
    expect((await GET(new Request("http://localhost?query=r"))).status).toBe(400);
    expect(
      (
        await GET(
          new Request(`http://localhost?query=${"r".repeat(101)}`),
        )
      ).status,
    ).toBe(400);
    expect(searchGitHubRepositories).not.toHaveBeenCalled();
  });

  it("returns matching repositories", async () => {
    const repositories = [{ fullName: "facebook/react" }];
    searchGitHubRepositories.mockResolvedValue(repositories);
    const response = await GET(new Request("http://localhost?query=react"));
    await expect(response.json()).resolves.toEqual({ repositories });
  });

  it("converts GitHub failures to a gateway error", async () => {
    searchGitHubRepositories.mockRejectedValue(new Error("GitHub unavailable"));
    const response = await GET(new Request("http://localhost?query=react"));
    expect(response.status).toBe(502);
  });
});
