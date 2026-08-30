import { describe, expect, it } from "vitest";
import {
  classifyIssue,
  matchesClassification,
} from "@/features/issues/lib/issue-classification";
import type { GitHubIssue } from "@/features/issues/types/search";

function issue(labels: string[]): GitHubIssue {
  return {
    number: 57,
    html_url: "https://github.com/acme/widgets/issues/57",
    title: "Update the contributor guide",
    body: "Clear steps are provided.",
    comments: 0,
    updated_at: "2026-08-30T00:00:00.000Z",
    created_at: "2026-08-29T00:00:00.000Z",
    repository_url: "https://api.github.com/repos/acme/widgets",
    labels: labels.map((name) => ({ name })),
    assignee: null,
  };
}

describe("issue classification", () => {
  it("classifies and explains explicit labels", () => {
    const classification = classifyIssue(
      issue(["first-timers-only", "documentation", "size/s"]),
    );

    expect(classification).toEqual({
      experience: ["first"],
      contributionTypes: ["documentation"],
      smallScope: true,
      signals: [
        "First-contribution label",
        "Documentation label",
        "Small-scope label",
      ],
    });
    expect(matchesClassification(classification, "first", "documentation", "small"))
      .toBe(true);
  });

  it("does not infer a classification from weak free text", () => {
    const classification = classifyIssue(issue([]));

    expect(classification).toEqual({
      experience: [],
      contributionTypes: [],
      smallScope: false,
      signals: [],
    });
    expect(matchesClassification(classification, "beginner", "any", "any"))
      .toBe(false);
  });

  it("uses explicit issue-template fields without guessing from prose", () => {
    const candidate = issue([]);
    candidate.body = [
      "## Contribution details",
      "- **Experience level:** Intermediate",
      "- **Contribution type:** Tests",
      "- **Estimated effort:** Small",
    ].join("\n");

    const classification = classifyIssue(candidate);

    expect(classification).toMatchObject({
      experience: ["intermediate"],
      contributionTypes: ["tests"],
      smallScope: true,
    });
    expect(classification.signals).toEqual([
      "Experience stated in issue template",
      "Contribution type stated in issue template",
      "Scope stated in issue template",
    ]);
  });

  it("reads standard GitHub Issue Form heading fields", () => {
    const candidate = issue([]);
    candidate.body = [
      "### Experience level",
      "Beginner",
      "",
      "### Contribution type",
      "Documentation",
      "",
      "### Scope",
      "Small",
    ].join("\n");

    expect(classifyIssue(candidate)).toMatchObject({
      experience: ["beginner"],
      contributionTypes: ["documentation"],
      smallScope: true,
    });
  });

  it("does not report unsupported or conflicting template values", () => {
    const candidate = issue(["small"]);
    candidate.body = [
      "Contribution type: chore",
      "Estimated effort: large",
    ].join("\n");

    expect(classifyIssue(candidate)).toEqual({
      experience: [],
      contributionTypes: [],
      smallScope: true,
      signals: ["Small-scope label"],
    });
  });

  it.each([
    ["Docs", "documentation"],
    ["Test", "tests"],
    ["Bug fix", "bugfix"],
    ["Feature", "feature"],
  ])("normalizes the %s contribution type", (value, expected) => {
    const candidate = issue([]);
    candidate.body = `Contribution type: ${value}`;

    expect(classifyIssue(candidate).contributionTypes).toEqual([expected]);
  });

  it("recognizes first-contribution and compact scope template values", () => {
    const candidate = issue([]);
    candidate.body = [
      "Experience: First contribution",
      "Size: S",
    ].join("\n");

    expect(classifyIssue(candidate)).toMatchObject({
      experience: ["first"],
      smallScope: true,
    });
  });
});
