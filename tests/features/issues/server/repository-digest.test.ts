import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/features/issues/server/github-search", () => ({
  getRecentRepositoryIssues: vi.fn(),
}));

import { getRecentRepositoryIssues } from "@/features/issues/server/github-search";
import { buildRepositoryDigest } from "@/features/issues/server/repository-digest";

const mockedGetIssues = vi.mocked(getRecentRepositoryIssues);

describe("buildRepositoryDigest", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders issue details and records a changed snapshot", async () => {
    mockedGetIssues.mockResolvedValue([
      {
        id: "https://github.com/acme/widgets/issues/3",
        title: "Escape <this>",
        url: "https://github.com/acme/widgets/issues/3",
        summary: "Useful & concise details",
        labels: ["help wanted"],
        createdAt: "2026-08-24T10:00:00Z",
        comments: 2,
        assigned: false,
      },
    ]);

    const digest = await buildRepositoryDigest([
      {
        id: "selection-1",
        fullName: "acme/widgets",
        url: "https://github.com/acme/widgets",
        lastIssueIds: "[]",
      },
    ]);

    expect(digest.changed).toBe(true);
    expect(digest.issueCount).toBe(1);
    expect(digest.snapshots[0].issueIds).toContain("issues/3");
    expect(digest.html).toContain("Escape &lt;this&gt;");
    expect(digest.html).toContain("Useful &amp; concise details");
    expect(digest.html).toContain("unassigned");
  });

  it("recognizes an unchanged five-issue set", async () => {
    mockedGetIssues.mockResolvedValue([
      {
        id: "issue-1",
        title: "Issue",
        url: "https://github.com/acme/widgets/issues/1",
        summary: "Details",
        labels: [],
        createdAt: "2026-08-24T10:00:00Z",
        comments: 0,
        assigned: true,
      },
    ]);

    const digest = await buildRepositoryDigest([
      {
        id: "selection-1",
        fullName: "acme/widgets",
        url: "https://github.com/acme/widgets",
        lastIssueIds: JSON.stringify(["issue-1"]),
      },
    ]);

    expect(digest.changed).toBe(false);
  });

  it("renders all five issues for each repository", async () => {
    mockedGetIssues.mockResolvedValue(
      Array.from({ length: 5 }, (_, index) => ({
        id: `issue-${index + 1}`,
        title: `Issue ${index + 1}`,
        url: `https://github.com/acme/widgets/issues/${index + 1}`,
        summary: `Details ${index + 1}`,
        labels: ["help wanted"],
        createdAt: "2026-08-24T10:00:00Z",
        comments: index,
        assigned: false,
      })),
    );

    const digest = await buildRepositoryDigest([
      {
        id: "selection-1",
        fullName: "acme/widgets",
        url: "https://github.com/acme/widgets",
        lastIssueIds: "[]",
      },
    ]);

    expect(digest.issueCount).toBe(5);
    expect(digest.repositoryCount).toBe(1);
    expect(digest.html.match(/class="issue-title-mobile"/g)).toHaveLength(5);
    expect(digest.html).not.toContain("more issues");
  });
});
