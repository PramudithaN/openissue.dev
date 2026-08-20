// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Issue, SearchResponse } from "@/features/issues/types/search";

const { addSavedSearch, deleteSavedSearch, getSavedSearches } = vi.hoisted(() => ({
  addSavedSearch: vi.fn(),
  deleteSavedSearch: vi.fn(),
  getSavedSearches: vi.fn(),
}));

vi.mock("@/features/issues/lib/saved-searches", () => ({
  addSavedSearch,
  deleteSavedSearch,
  getSavedSearches,
}));

vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => <button type="button">Theme</button>,
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
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("IssueFinder", () => {
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
