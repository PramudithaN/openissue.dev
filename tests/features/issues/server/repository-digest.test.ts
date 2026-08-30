import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/features/issues/server/github-search", () => ({
  getRecentRepositoryIssues: vi.fn(),
  getRepositoryResponsiveness: vi.fn(),
}));

import {
  getRecentRepositoryIssues,
  getRepositoryResponsiveness,
} from "@/features/issues/server/github-search";
import { buildRepositoryDigest } from "@/features/issues/server/repository-digest";

const mockedGetIssues = vi.mocked(getRecentRepositoryIssues);
const mockedGetResponsiveness = vi.mocked(getRepositoryResponsiveness);
const repositoryHealth = {
  score: 80,
  label: "active" as const,
  signals: ["Pushed within 30 days"],
};

describe("buildRepositoryDigest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetResponsiveness.mockResolvedValue({
      status: "responsive",
      sampleDays: 90,
      sampleSize: 6,
      signals: ["Median first maintainer response: 1 day"],
    });
  });

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
        qualityScore: 75,
        repositoryHealth,
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
    expect(digest.html).toContain("80 quality");
    expect(digest.html).toContain("80 active health");
    expect(digest.html).toContain("Responsive maintainer responsiveness");
    expect(digest.html).toContain("6 samples over 90 days");
    expect(digest.html).toContain("Median first maintainer response: 1 day");
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
        qualityScore: 75,
        repositoryHealth,
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

  it("renders repository responsiveness when no recent issues are available", async () => {
    mockedGetIssues.mockResolvedValue([]);
    mockedGetResponsiveness.mockResolvedValue({
      status: "unknown",
      sampleDays: 90,
      sampleSize: 0,
      signals: ["Fewer than 4 recent contribution samples"],
    });

    const digest = await buildRepositoryDigest([
      {
        id: "selection-1",
        fullName: "acme/widgets",
        url: "https://github.com/acme/widgets",
        lastIssueIds: "[]",
      },
    ]);

    expect(digest.html).toContain("No open issues found.");
    expect(digest.html).toContain("Unknown maintainer responsiveness");
    expect(digest.html).toContain("Fewer than 4 recent contribution samples");
  });

  it("keeps issue alerts when responsiveness analytics fail", async () => {
    mockedGetIssues.mockResolvedValue([
      {
        id: "issue-1",
        title: "Issue",
        url: "https://github.com/acme/widgets/issues/1",
        summary: "Details",
        labels: [],
        createdAt: "2026-08-24T10:00:00Z",
        comments: 0,
        assigned: false,
        qualityScore: 75,
        repositoryHealth,
      },
    ]);
    mockedGetResponsiveness.mockRejectedValue(new Error("GitHub unavailable"));

    const digest = await buildRepositoryDigest([
      {
        id: "selection-1",
        fullName: "acme/widgets",
        url: "https://github.com/acme/widgets",
        lastIssueIds: "[]",
      },
    ]);

    expect(digest.issueCount).toBe(1);
    expect(digest.html).toContain("Issue");
    expect(digest.html).toContain("Unknown maintainer responsiveness");
    expect(digest.html).toContain("Responsiveness sample unavailable");
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
        qualityScore: 75,
        repositoryHealth,
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
