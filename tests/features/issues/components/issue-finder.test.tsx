// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Issue, SearchResponse } from "@/features/issues/types/search";

const {
  addSavedSearch,
  deleteSavedSearch,
  getSavedSearches,
  replaceSavedSearches,
  syncSavedSearches,
  deleteCloudSavedSearch,
  getDigestPreference,
  getAlertEmail,
  triggerWeeklyDigest,
  updateDigestPreference,
  updateAlertEmail,
  useSession,
  getOpportunities,
  updateOpportunity,
} = vi.hoisted(() => ({
  addSavedSearch: vi.fn(),
  deleteSavedSearch: vi.fn(),
  getSavedSearches: vi.fn(),
  replaceSavedSearches: vi.fn(),
  syncSavedSearches: vi.fn(),
  deleteCloudSavedSearch: vi.fn(),
  getDigestPreference: vi.fn(),
  getAlertEmail: vi.fn(),
  triggerWeeklyDigest: vi.fn(),
  updateDigestPreference: vi.fn(),
  updateAlertEmail: vi.fn(),
  useSession: vi.fn(),
  getOpportunities: vi.fn(),
  updateOpportunity: vi.fn(),
}));

vi.mock("@/features/issues/lib/saved-searches", () => ({
  addSavedSearch,
  deleteSavedSearch,
  getSavedSearches,
  replaceSavedSearches,
}));

vi.mock("@/features/issues/lib/saved-search-cloud", () => ({
  syncSavedSearches,
  deleteCloudSavedSearch,
}));

vi.mock("@/features/issues/lib/digest-preference-cloud", () => ({
  getDigestPreference,
  getAlertEmail,
  triggerWeeklyDigest,
  updateDigestPreference,
  updateAlertEmail,
}));

vi.mock("@/features/issues/lib/opportunity-cloud", () => ({
  getOpportunities,
  updateOpportunity,
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession,
    signIn: { social: vi.fn() },
    signOut: vi.fn(),
  },
}));

vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => <button type="button">Theme</button>,
}));

vi.mock("@/features/issues/components/contribution-history", () => ({
  ContributionHistory: () => <div>Contribution history</div>,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children }: any) => (
    <div data-value={value} data-change={onValueChange ? "yes" : "no"}>{children}</div>
  ),
  SelectTrigger: ({ children, ...props }: any) => <button type="button" {...props}>{children}</button>,
  SelectValue: ({ children }: any) => <span>{children}</span>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <span data-value={value}>{children}</span>,
}));

import { IssueFinder } from "@/features/issues/components/issue-finder";

function issue(id: number, qualityScore = 50): Issue {
  return {
    id: `issue-${id}`,
    title: `Issue ${id}`,
    url: `https://github.com/acme/repo/issues/${id}`,
    repo: "acme/repo",
    repoUrl: "https://github.com/acme/repo",
    stars: 100,
    comments: 0,
    labels: ["help wanted"],
    updatedAt: `2026-08-${String((id % 20) + 1).padStart(2, "0")}T00:00:00.000Z`,
    createdAt: "2026-08-01T00:00:00.000Z",
    assigned: false,
    linkedPrCount: 0,
    hacktoberfest: false,
    hacktoberfestSource: null,
    qualityScore,
    helpStatus: "open",
  };
}

function response(overrides: Partial<SearchResponse> = {}): SearchResponse {
  return {
    query: "is:issue language:Java",
    totalCount: 1000,
    candidateCount: 30,
    rateLimitRemaining: "4999",
    tokenConfigured: true,
    issues: Array.from({ length: 24 }, (_, index) => issue(index + 1, index)),
    page: 1,
    ...overrides,
  };
}

function jsonResponse(payload: SearchResponse, ok = true) {
  return { ok, json: vi.fn().mockResolvedValue(payload) };
}

beforeEach(() => {
  getSavedSearches.mockReset().mockReturnValue([]);
  addSavedSearch.mockReset();
  deleteSavedSearch.mockReset();
  replaceSavedSearches.mockReset();
  syncSavedSearches.mockReset().mockResolvedValue([]);
  deleteCloudSavedSearch.mockReset().mockResolvedValue(undefined);
  getDigestPreference.mockReset().mockResolvedValue(false);
  getAlertEmail.mockReset().mockResolvedValue("");
  triggerWeeklyDigest.mockReset().mockResolvedValue(undefined);
  updateDigestPreference.mockReset().mockResolvedValue(true);
  updateAlertEmail.mockReset().mockResolvedValue("");
  useSession.mockReset().mockReturnValue({ data: null, isPending: false });
  getOpportunities.mockReset().mockResolvedValue([]);
  updateOpportunity.mockReset().mockResolvedValue(null);
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("IssueFinder", () => {
  it("defaults to results and mounts contribution history only after tab selection", () => {
    useSession.mockReturnValue({
      data: { user: { id: "user-1", name: "Octo Cat" } },
      isPending: false,
    });

    render(<IssueFinder />);

    expect(
      screen.getByRole("tab", { name: "Ranked issues" }).getAttribute(
        "aria-selected",
      ),
    ).toBe("true");
    expect(screen.queryByText("Contribution history", { selector: "div" })).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Contribution history" }));
    expect(screen.getByText("Contribution history", { selector: "div" })).toBeTruthy();
    expect(
      screen.getByRole("tab", { name: "Contribution history" }).getAttribute(
        "aria-selected",
      ),
    ).toBe("true");
  });

  it("restores and caches account searches after sign-in", async () => {
    const saved = {
      id: "saved-cloud",
      name: "Cloud search",
      tech: "Go",
      label: "bug",
      sort: "created",
      linkedPr: "any",
      hacktoberfest: "any",
      createdAt: "2026-08-19T00:00:00.000Z",
    };
    useSession.mockReturnValue({
      data: { user: { id: "user-1", name: "Octo Cat" } },
      isPending: false,
    });
    syncSavedSearches.mockResolvedValue([saved]);

    render(<IssueFinder />);

    expect(await screen.findByText("Cloud search")).toBeTruthy();
    expect(syncSavedSearches).toHaveBeenCalledWith([]);
    expect(replaceSavedSearches).toHaveBeenCalledWith([saved]);
  });

  it("loads and updates the weekly digest preference", async () => {
    useSession.mockReturnValue({
      data: { user: { id: "user-1", name: "Octo Cat" } },
      isPending: false,
    });
    getDigestPreference.mockResolvedValue(false);

    render(<IssueFinder />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Enable weekly digest" }),
    );

    await waitFor(() => expect(updateDigestPreference).toHaveBeenCalledWith(true));
    expect(screen.getByRole("button", { name: "Disable weekly digest" })).toBeTruthy();
  });

  it("loads, saves, and clears the alternate alert email", async () => {
    useSession.mockReturnValue({
      data: {
        user: {
          id: "user-1",
          name: "Octo Cat",
          email: "github@example.com",
        },
      },
      isPending: false,
    });
    getAlertEmail.mockResolvedValue("alerts@example.com");
    updateAlertEmail
      .mockResolvedValueOnce("next@example.com")
      .mockResolvedValueOnce("");

    render(<IssueFinder />);
    const input = await screen.findByLabelText("Alternate alert email");
    expect((input as HTMLInputElement).value).toBe("alerts@example.com");

    fireEvent.change(input, { target: { value: "next@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Save alert email" }));
    expect(
      await screen.findByText("Alerts will be sent to next@example.com."),
    ).toBeTruthy();

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save alert email" }));
    expect(
      await screen.findByText("Alerts will use your GitHub-linked email."),
    ).toBeTruthy();
  });

  it("manually sends a digest for an authenticated saved search", async () => {
    const saved = {
      id: "saved-1",
      name: "React docs",
      tech: "React",
      label: "documentation",
      sort: "updated",
      linkedPr: "any",
      hacktoberfest: "any",
      createdAt: "2026-08-19T00:00:00.000Z",
    };
    useSession.mockReturnValue({
      data: { user: { id: "user-1", name: "Octo Cat" } },
      isPending: false,
    });
    getSavedSearches.mockReturnValue([saved]);
    syncSavedSearches.mockResolvedValue([saved]);

    render(<IssueFinder />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Send digest now" }),
    );

    await waitFor(() => expect(triggerWeeklyDigest).toHaveBeenCalledOnce());
    expect(await screen.findByText("Weekly digest sent. Check your inbox.")).toBeTruthy();
  });

  it("validates and manages saved searches", async () => {
    const saved = {
      id: "saved-1",
      name: "React bugs",
      tech: "React",
      label: "bug",
      sort: "created",
      linkedPr: "no",
      hacktoberfest: "only",
      createdAt: "2026-08-19T00:00:00.000Z",
    };
    getSavedSearches.mockReturnValueOnce([]).mockReturnValueOnce([]);
    addSavedSearch.mockReturnValue(saved);

    render(<IssueFinder />);
    fireEvent.click(screen.getByRole("button", { name: /save current search/i }));
    expect(screen.getByText("Enter a name for the saved search.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Saved search name"), { target: { value: "React bugs" } });
    fireEvent.change(screen.getByLabelText("Technology"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /save current search/i }));
    expect(screen.getByText("Enter a technology before saving the search.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Technology"), { target: { value: "React" } });
    fireEvent.click(screen.getByRole("button", { name: /save current search/i }));
    expect(addSavedSearch).toHaveBeenCalled();
    expect(screen.getByText("React bugs")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Delete React bugs" }));
    expect(deleteSavedSearch).toHaveBeenCalledWith("saved-1");
  });

  it("shows save failures", () => {
    addSavedSearch.mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    render(<IssueFinder />);
    fireEvent.change(screen.getByLabelText("Saved search name"), { target: { value: "Java" } });
    fireEvent.click(screen.getByRole("button", { name: /save current search/i }));
    expect(screen.getByText("Storage unavailable")).toBeTruthy();
  });

  it("keeps an authenticated save locally when account sync fails", async () => {
    useSession.mockReturnValue({
      data: { user: { id: "user-1", name: "Octo Cat" } },
      isPending: false,
    });
    const saved = {
      id: "saved-1",
      name: "Java",
      tech: "Java",
      label: "help-wanted",
      sort: "updated",
      linkedPr: "any",
      hacktoberfest: "any",
      createdAt: "2026-08-19T00:00:00.000Z",
    };
    addSavedSearch.mockReturnValue(saved);
    syncSavedSearches
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("offline"));

    render(<IssueFinder />);
    fireEvent.change(screen.getByLabelText("Saved search name"), {
      target: { value: "Java" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save current search/i }));

    expect(
      await screen.findByText("Search saved locally, but account sync failed."),
    ).toBeTruthy();
  });

  it("syncs the complete local collection after an authenticated save", async () => {
    useSession.mockReturnValue({
      data: { user: { id: "user-1", name: "Octo Cat" } },
      isPending: false,
    });
    const olderSearch = {
      id: "saved-older",
      name: "Older local search",
      tech: "Rust",
      label: "bug",
      sort: "updated",
      linkedPr: "any",
      hacktoberfest: "any",
      createdAt: "2026-08-18T00:00:00.000Z",
    };
    const saved = {
      ...olderSearch,
      id: "saved-new",
      name: "Java",
      tech: "Java",
      createdAt: "2026-08-19T00:00:00.000Z",
    };
    addSavedSearch.mockReturnValue(saved);
    getSavedSearches
      .mockReturnValueOnce([olderSearch])
      .mockReturnValueOnce([olderSearch])
      .mockReturnValue([olderSearch, saved]);
    syncSavedSearches
      .mockResolvedValueOnce([olderSearch])
      .mockResolvedValueOnce([olderSearch, saved]);

    render(<IssueFinder />);
    await waitFor(() => expect(syncSavedSearches).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("Saved search name"), {
      target: { value: "Java" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save current search/i }));

    await waitFor(() =>
      expect(syncSavedSearches).toHaveBeenLastCalledWith([olderSearch, saved]),
    );
    expect(replaceSavedSearches).toHaveBeenLastCalledWith([
      olderSearch,
      saved,
    ]);
  });

  it("removes an authenticated search from cloud and local storage", async () => {
    const saved = {
      id: "saved-1",
      name: "React bugs",
      tech: "React",
      label: "bug",
      sort: "created",
      linkedPr: "no",
      hacktoberfest: "only",
      createdAt: "2026-08-19T00:00:00.000Z",
    };
    useSession.mockReturnValue({
      data: { user: { id: "user-1", name: "Octo Cat" } },
      isPending: false,
    });
    getSavedSearches.mockReturnValue([saved]);
    syncSavedSearches.mockResolvedValue([saved]);

    render(<IssueFinder />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete React bugs" }));

    await waitFor(() => expect(deleteCloudSavedSearch).toHaveBeenCalledWith("saved-1"));
    expect(deleteSavedSearch).toHaveBeenCalledWith("saved-1");
  });

  it("keeps a saved search locally when account deletion fails", async () => {
    const saved = {
      id: "saved-1",
      name: "React bugs",
      tech: "React",
      label: "bug",
      sort: "created",
      linkedPr: "no",
      hacktoberfest: "only",
      createdAt: "2026-08-19T00:00:00.000Z",
    };
    useSession.mockReturnValue({
      data: { user: { id: "user-1", name: "Octo Cat" } },
      isPending: false,
    });
    getSavedSearches.mockReturnValue([saved]);
    syncSavedSearches.mockResolvedValue([saved]);
    deleteCloudSavedSearch.mockRejectedValue(new Error("Cloud unavailable"));

    render(<IssueFinder />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete React bugs" }));

    expect(await screen.findByText("Cloud unavailable")).toBeTruthy();
    expect(deleteSavedSearch).not.toHaveBeenCalled();
  });

  it("searches, ranks, and loads another page", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(response()) as any)
      .mockResolvedValueOnce(
        jsonResponse(response({ issues: [issue(25, 99)], page: 2, candidateCount: 25 })) as any,
      );

    render(<IssueFinder />);
    fireEvent.submit(screen.getByRole("button", { name: "Search" }).closest("form")!);

    expect(await screen.findByRole("heading", { name: "Ranked issues" })).toBeTruthy();
    expect(screen.getByText("Issue 24")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load More" }));
    expect(await screen.findByText("Issue 25")).toBeTruthy();
    expect(fetchMock.mock.calls[1][0]).toContain("page=2");
  });

  it("restores and updates saved opportunities for authenticated users", async () => {
    useSession.mockReturnValue({
      data: { user: { id: "user-1", name: "Octo Cat" } },
      isPending: false,
    });
    getOpportunities.mockResolvedValue([
      {
        id: "opportunity-1",
        repositoryFullName: "acme/repo",
        issueNumber: 1,
        issueUrl: "https://github.com/acme/repo/issues/1",
        title: "Issue 1",
        savedAt: "2026-08-20T00:00:00.000Z",
        openedAt: null,
      },
    ]);
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).startsWith("/api/search?")) {
        return jsonResponse(response()) as any;
      }

      return {
        ok: true,
        json: vi.fn().mockResolvedValue({
          isAdmin: false,
          template: null,
        }),
      } as any;
    });

    render(<IssueFinder />);
    fireEvent.submit(screen.getByRole("button", { name: "Search" }).closest("form")!);
    expect(await screen.findByRole("button", { name: "Saved" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Saved" }));
    await waitFor(() =>
      expect(updateOpportunity).toHaveBeenCalledWith(issue(1, 0), "unsave"),
    );
    const issueLink = screen
      .getAllByRole("link", { name: "Open issue" })
      .find((link) => link.getAttribute("href") === issue(1).url);
    expect(issueLink).toBeTruthy();
    fireEvent.click(issueLink!);
    await waitFor(() =>
      expect(updateOpportunity).toHaveBeenCalledWith(issue(1, 0), "open"),
    );
  });

  it("handles empty searches and API failures", async () => {
    const fetchMock = vi.mocked(fetch);
    render(<IssueFinder />);
    fireEvent.change(screen.getByLabelText("Technology"), { target: { value: " " } });
    fireEvent.submit(screen.getByRole("button", { name: "Search" }).closest("form")!);
    expect(screen.getByText("Enter a technology to search.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Technology"), { target: { value: "Rust" } });
    fetchMock.mockResolvedValueOnce(
      jsonResponse(response({ issues: [], candidateCount: 0, error: "No access" }), false) as any,
    );
    fireEvent.submit(screen.getByRole("button", { name: "Search" }).closest("form")!);
    expect(await screen.findByText("No access")).toBeTruthy();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Cooldown..." })).toBeTruthy(),
    );
  });

  it("updates every quick technology and supported label", () => {
    render(<IssueFinder />);
    for (const technology of ["Spring Boot", "React", "Python", "Kubernetes", "Java"]) {
      fireEvent.click(screen.getByRole("button", { name: technology }));
      expect((screen.getByLabelText("Technology") as HTMLInputElement).value).toBe(technology);
    }
    for (const label of [
      "help wanted",
      "good first issue",
      "up-for-grabs",
      "first-timers-only",
      "hacktoberfest",
      "bug",
      "documentation",
    ]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
    }
  });

  it("runs a saved search and reports pagination failures", async () => {
    const saved = {
      id: "saved-2",
      name: "Saved Rust",
      tech: "Rust",
      label: "bug",
      sort: "comments",
      linkedPr: "yes",
      hacktoberfest: "any",
      createdAt: "2026-08-19T00:00:00.000Z",
    };
    getSavedSearches.mockReturnValue([saved]);
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(response()) as any)
      .mockResolvedValueOnce(
        jsonResponse(response({ error: "Pagination failed" }), false) as any,
      );

    render(<IssueFinder />);
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(await screen.findByText("Ranked issues")).toBeTruthy();
    expect(fetchMock.mock.calls[0][0]).toContain("tech=Rust");
    fireEvent.click(screen.getByRole("button", { name: "Load More" }));
    expect(await screen.findByText("Pagination failed")).toBeTruthy();
  });

  it("uses the fallback message for non-Error pagination failures", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(response()) as any)
      .mockRejectedValueOnce("offline");
    render(<IssueFinder />);
    fireEvent.submit(screen.getByRole("button", { name: "Search" }).closest("form")!);
    await screen.findByText("Ranked issues");
    fireEvent.click(screen.getByRole("button", { name: "Load More" }));
    expect(await screen.findByText("Failed to load more issues.")).toBeTruthy();
  });
});
