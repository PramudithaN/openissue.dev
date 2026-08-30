import { describe, expect, it } from "vitest";
import {
  getResponsivenessBoost,
  scoreRepositoryResponsiveness,
  type ResponsivenessIssue,
} from "@/features/issues/lib/repository-responsiveness";

const now = new Date("2026-08-30T00:00:00Z").getTime();

function issue(
  createdAt: string,
  response?: { association: string; createdAt: string; login?: string },
): ResponsivenessIssue {
  return {
    author: { login: "contributor" },
    createdAt,
    closedAt: response ? "2026-08-29T00:00:00Z" : null,
    labels: { nodes: [{ name: "good first issue" }] },
    comments: {
      nodes: response
        ? [
            {
              author: { login: response.login ?? "maintainer" },
              authorAssociation: response.association,
              createdAt: response.createdAt,
            },
          ]
        : [],
    },
  };
}

describe("repository responsiveness", () => {
  it("uses only responsive and variable statuses as ranking signals", () => {
    expect(getResponsivenessBoost("responsive")).toBe(5);
    expect(getResponsivenessBoost("variable")).toBe(2);
    expect(getResponsivenessBoost("slow")).toBe(0);
    expect(getResponsivenessBoost("unknown")).toBe(0);
  });

  it("identifies consistently quick maintainer responses", () => {
    const summary = scoreRepositoryResponsiveness(
      [
        issue("2026-08-20T00:00:00Z", { association: "OWNER", createdAt: "2026-08-20T12:00:00Z" }),
        issue("2026-08-21T00:00:00Z", { association: "MEMBER", createdAt: "2026-08-22T00:00:00Z" }),
        issue("2026-08-22T00:00:00Z", { association: "COLLABORATOR", createdAt: "2026-08-24T00:00:00Z" }),
      ],
      [{ authorAssociation: "CONTRIBUTOR", createdAt: "2026-08-20T00:00:00Z", mergedAt: "2026-08-23T00:00:00Z" }],
      now,
    );

    expect(summary.status).toBe("responsive");
    expect(summary.sampleSize).toBe(4);
    expect(summary.signals[0]).toContain("1 days");
  });

  it("does not count the issue author's own comment as a maintainer response", () => {
    const issues = Array.from({ length: 4 }, (_, index) =>
      issue(`2026-08-${20 + index}T00:00:00Z`, {
        association: "OWNER",
        createdAt: `2026-08-${21 + index}T00:00:00Z`,
        login: "contributor",
      }),
    );

    expect(scoreRepositoryResponsiveness(issues, [], now).status).toBe("slow");
  });

  it("identifies repositories with mixed response speed as variable", () => {
    const issues = Array.from({ length: 4 }, (_, index) =>
      issue(`2026-08-${10 + index}T00:00:00Z`, {
        association: "MEMBER",
        createdAt: `2026-08-${15 + index}T00:00:00Z`,
      }),
    );

    expect(scoreRepositoryResponsiveness(issues, [], now).status).toBe(
      "variable",
    );
  });

  it("does not mark repositories responsive when external pull requests are not merged", () => {
    const issues = [
      issue("2026-08-20T00:00:00Z", {
        association: "OWNER",
        createdAt: "2026-08-21T00:00:00Z",
      }),
      issue("2026-08-22T00:00:00Z", {
        association: "MEMBER",
        createdAt: "2026-08-23T00:00:00Z",
      }),
    ];
    const pullRequests = Array.from({ length: 4 }, (_, index) => ({
      authorAssociation: "CONTRIBUTOR",
      createdAt: `2026-08-${24 + index}T00:00:00Z`,
      mergedAt: null,
    }));

    expect(
      scoreRepositoryResponsiveness(issues, pullRequests, now).status,
    ).toBe("slow");
  });

  it("returns unknown when the bounded sample is insufficient", () => {
    const summary = scoreRepositoryResponsiveness(
      [issue("2026-08-20T00:00:00Z")],
      [],
      now,
    );

    expect(summary).toMatchObject({ status: "unknown", sampleSize: 1 });
  });
});
