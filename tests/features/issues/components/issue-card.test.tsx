// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IssueCard } from "@/features/issues/components/issue-card";
import { LoadingResults } from "@/features/issues/components/loading-results";
import { Metric } from "@/features/issues/components/metric";
import type { Issue } from "@/features/issues/types/search";

function issue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "issue-1",
    title: "Improve accessibility",
    url: "https://github.com/acme/repo/issues/1",
    repo: "acme/repo",
    repoUrl: "https://github.com/acme/repo",
    stars: 12500,
    comments: 3,
    labels: ["help wanted", "a", "b", "c", "d", "e", "hidden"],
    updatedAt: "2026-08-18T00:00:00.000Z",
    createdAt: "2026-08-01T00:00:00.000Z",
    assigned: false,
    linkedPrCount: 2,
    hacktoberfest: true,
    hacktoberfestSource: "repo-topic",
    qualityScore: 80,
    helpStatus: "open",
    ...overrides,
  };
}

afterEach(cleanup);

describe("issue presentation", () => {
  it("renders a high-quality open Hacktoberfest issue", () => {
    vi.setSystemTime(new Date("2026-08-19T00:00:00.000Z"));
    render(<IssueCard issue={issue()} />);

    expect(screen.getByText("12.5K")).toBeTruthy();
    expect(screen.getByText("Hacktoberfest repo")).toBeTruthy();
    expect(screen.getByText("Needs Help")).toBeTruthy();
    expect(screen.queryByText("hidden")).toBeNull();
    vi.useRealTimers();
  });

  it("renders medium, claimed, nullable metadata", () => {
    render(
      <IssueCard
        issue={issue({
          qualityScore: 50,
          helpStatus: "claimed",
          hacktoberfestSource: "issue-label",
          stars: null,
          linkedPrCount: null,
          assigned: true,
        })}
      />,
    );
    expect(screen.getByText("Hacktoberfest label")).toBeTruthy();
    expect(screen.getByText("Possibly Claimed")).toBeTruthy();
    expect(screen.getByText("Assigned")).toBeTruthy();
  });

  it("renders low-quality resolved non-Hacktoberfest issues", () => {
    render(
      <IssueCard
        issue={issue({
          qualityScore: 20,
          helpStatus: "resolved",
          hacktoberfest: false,
          hacktoberfestSource: null,
        })}
      />,
    );
    expect(screen.getByText("20 quality")).toBeTruthy();
    expect(screen.getByText("Likely Resolved")).toBeTruthy();
  });

  it("renders loading placeholders and metrics", () => {
    const { container } = render(<LoadingResults />);
    expect(container.querySelectorAll("[data-slot=card]")).toHaveLength(4);
    cleanup();
    render(<Metric label="Ranked" value="24" />);
    expect(screen.getByText("Ranked")).toBeTruthy();
    expect(screen.getByText("24")).toBeTruthy();
  });
});
