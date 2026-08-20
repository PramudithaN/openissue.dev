// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addSavedSearch,
  deleteSavedSearch,
  getSavedSearches,
  isValidSavedSearch,
  replaceSavedSearches,
} from "@/features/issues/lib/saved-searches";

const validSearch = {
  id: "saved-1",
  name: "React help",
  tech: "React",
  label: "help-wanted",
  sort: "updated",
  linkedPr: "any",
  hacktoberfest: "any",
  createdAt: "2026-08-19T00:00:00.000Z",
};

describe("saved searches", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("returns only structurally valid saved searches", () => {
    localStorage.setItem(
      "openissue:saved-searches",
      JSON.stringify([
        validSearch,
        null,
        "invalid",
        { ...validSearch, label: "unknown" },
        { ...validSearch, sort: "unknown" },
        { ...validSearch, linkedPr: "unknown" },
        { ...validSearch, hacktoberfest: "unknown" },
        { ...validSearch, id: 1 },
      ]),
    );

    expect(getSavedSearches()).toEqual([validSearch]);
  });

  it("handles empty, malformed, and non-array storage", () => {
    expect(getSavedSearches()).toEqual([]);
    localStorage.setItem("openissue:saved-searches", "not json");
    expect(getSavedSearches()).toEqual([]);
    localStorage.setItem("openissue:saved-searches", JSON.stringify({}));
    expect(getSavedSearches()).toEqual([]);
  });

  it("adds and deletes searches", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");

    const added = addSavedSearch({
      name: "TypeScript",
      tech: "TypeScript",
      label: "good-first-issue",
      sort: "created",
      linkedPr: "no",
      hacktoberfest: "only",
    });

    expect(added.id).toBe("00000000-0000-4000-8000-000000000001");
    expect(getSavedSearches()).toEqual([added]);
    deleteSavedSearch(added.id);
    expect(getSavedSearches()).toEqual([]);
  });

  it("replaces the local cache with searches restored from an account", () => {
    replaceSavedSearches([validSearch]);

    expect(getSavedSearches()).toEqual([validSearch]);
    expect(isValidSavedSearch(validSearch)).toBe(true);
  });

  it("reports storage write failures", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    expect(() =>
      addSavedSearch({
        name: "Broken",
        tech: "Go",
        label: "bug",
        sort: "comments",
        linkedPr: "yes",
        hacktoberfest: "any",
      }),
    ).toThrow("Unable to save search.");
    expect(() => replaceSavedSearches([])).toThrow(
      "Unable to update saved searches.",
    );
  });
});
