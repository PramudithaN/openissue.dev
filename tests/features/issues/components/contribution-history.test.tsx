// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getContributionHistory } = vi.hoisted(() => ({
  getContributionHistory: vi.fn(),
}));

vi.mock("@/features/issues/lib/contribution-history-cloud", () => ({
  getContributionHistory,
}));

import { ContributionHistory } from "@/features/issues/components/contribution-history";

const contribution = {
  id: "https://github.com/acme/widgets/pull/2",
  type: "pull-request" as const,
  title: "Add widget docs",
  url: "https://github.com/acme/widgets/pull/2",
  repository: "acme/widgets",
  repositoryUrl: "https://github.com/acme/widgets",
  status: "merged" as const,
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-20T00:00:00Z",
  opportunity: {
    savedAt: "2026-08-10T00:00:00Z",
    openedAt: "2026-08-11T00:00:00Z",
  },
};

describe("ContributionHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getContributionHistory.mockResolvedValue({
      contributions: [contribution],
      totalCount: 31,
      page: 1,
      hasMore: true,
    });
  });

  afterEach(() => cleanup());

  it("shows contribution links, types, statuses, and loads another page", async () => {
    render(<ContributionHistory />);

    expect(await screen.findByRole("link", { name: "Add widget docs" })).toHaveProperty(
      "href",
      contribution.url,
    );
    expect(screen.getByText("Pull request")).toBeTruthy();
    expect(screen.getByText("merged")).toBeTruthy();
    expect(screen.getByText("Saved opportunity")).toBeTruthy();
    expect(screen.getByText("Opened from OpenIssue")).toBeTruthy();

    getContributionHistory.mockResolvedValueOnce({
      contributions: [
        contribution,
        {
          ...contribution,
          id: "https://github.com/acme/widgets/issues/4",
          type: "issue",
          title: "Document another widget",
          url: "https://github.com/acme/widgets/issues/4",
        },
      ],
      totalCount: 31,
      page: 2,
      hasMore: false,
    });
    fireEvent.click(screen.getByRole("button", { name: "Load more contributions" }));
    await waitFor(() => expect(getContributionHistory).toHaveBeenLastCalledWith(2));
    expect(screen.getAllByRole("link", { name: contribution.title })).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: "Document another widget" }),
    ).toBeTruthy();
  });

  it("shows load failures", async () => {
    getContributionHistory.mockRejectedValueOnce(new Error("GitHub unavailable."));
    render(<ContributionHistory />);
    expect(await screen.findByText("GitHub unavailable.")).toBeTruthy();
  });

  it("uses the fallback for non-error initial failures", async () => {
    getContributionHistory.mockRejectedValueOnce("offline");
    render(<ContributionHistory />);
    expect(
      await screen.findByText("Unable to load contribution history."),
    ).toBeTruthy();
  });

  it("shows an empty history", async () => {
    getContributionHistory.mockResolvedValueOnce({
      contributions: [],
      totalCount: 0,
      page: 1,
      hasMore: false,
    });
    render(<ContributionHistory />);
    expect(
      await screen.findByText("No public issues or pull requests found."),
    ).toBeTruthy();
    expect(screen.queryByText(/total$/)).toBeNull();
  });

  it("renders issues without tracked opportunity badges", async () => {
    getContributionHistory.mockResolvedValueOnce({
      contributions: [
        {
          ...contribution,
          id: "https://github.com/acme/widgets/issues/3",
          type: "issue",
          url: "https://github.com/acme/widgets/issues/3",
          status: "open",
          opportunity: null,
        },
      ],
      totalCount: 1,
      page: 1,
      hasMore: false,
    });
    render(<ContributionHistory />);
    expect(await screen.findByText("Issue")).toBeTruthy();
    expect(screen.queryByText("Saved opportunity")).toBeNull();
    expect(screen.queryByText("Opened from OpenIssue")).toBeNull();
  });

  it("reports load-more failures and keeps existing contributions", async () => {
    render(<ContributionHistory />);
    await screen.findByRole("link", { name: contribution.title });
    getContributionHistory.mockRejectedValueOnce("offline");

    fireEvent.click(screen.getByRole("button", { name: "Load more contributions" }));
    expect(
      await screen.findByText("Unable to load contribution history."),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: contribution.title })).toBeTruthy();
  });
});
