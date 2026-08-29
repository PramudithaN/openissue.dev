import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSession,
  database,
  rowsByTable,
  buildWeeklyDigest,
  buildRepositoryDigest,
  renderAlertEmail,
  getRepositoryDigestSource,
  sendWeeklyDigest,
} = vi.hoisted(() => {
  const rowsByTable = new Map<unknown, unknown[]>();
  const database = {
    select: vi.fn().mockReturnValue({
      from: (table: unknown) => ({
        where: () => {
          const rows = rowsByTable.get(table) ?? [];
          const promise = Promise.resolve(rows);
          return {
            limit: async () => rows,
            orderBy: async () => rows,
            then: promise.then.bind(promise),
          };
        },
      }),
    }),
  };
  return {
    getSession: vi.fn(),
    database,
    rowsByTable,
    buildWeeklyDigest: vi.fn(),
    buildRepositoryDigest: vi.fn(),
    renderAlertEmail: vi.fn(),
    getRepositoryDigestSource: vi.fn(),
    sendWeeklyDigest: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/db", () => ({ getDatabase: () => database }));
vi.mock("@/features/issues/server/weekly-digest", () => ({
  buildWeeklyDigest,
  sendWeeklyDigest,
}));
vi.mock("@/features/issues/server/repository-digest", () => ({
  buildRepositoryDigest,
}));
vi.mock("@/features/issues/server/digest-delivery", () => ({
  getRepositoryDigestSource,
  renderAlertEmail,
}));

import { GET, POST } from "@/app/api/admin/test-email/route";
import {
  admin,
  savedSearch,
} from "@/lib/auth-schema";

describe("admin test email API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SMTP_USER", "sender@example.com");
    vi.stubEnv("SMTP_APP_PASSWORD", "app-password");
    vi.stubEnv("DIGEST_FROM_EMAIL", "sender@example.com");
    rowsByTable.clear();
    getSession.mockResolvedValue({ user: { id: "admin-1" } });
    rowsByTable.set(admin, [{ userId: "admin-1" }]);
    buildWeeklyDigest.mockResolvedValue({ html: "<p>Searches</p>", issueCount: 2 });
    buildRepositoryDigest.mockResolvedValue({
      html: "<tr><td>Repositories</td></tr>",
      issueCount: 5,
      repositoryCount: 1,
    });
    renderAlertEmail.mockReturnValue("<html>Combined</html>");
    getRepositoryDigestSource.mockResolvedValue({
      template: { id: "template-1" },
      repositories: [],
    });
    sendWeeklyDigest.mockResolvedValue(undefined);
  });

  it("reports missing email configuration before building content", async () => {
    vi.stubEnv("SMTP_USER", "");
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          recipientEmail: "test@example.com",
          mode: "combined",
        }),
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Test email delivery is not configured for this environment.",
    });
    expect(buildWeeklyDigest).not.toHaveBeenCalled();
  });

  it("returns JSON when test delivery fails", async () => {
    rowsByTable.set(savedSearch, [
      { id: "search-1", createdAt: new Date("2026-08-01T00:00:00Z") },
    ]);
    getRepositoryDigestSource.mockResolvedValueOnce({
      template: { id: "template-1" },
      repositories: [{ id: "repo-1" }],
    });
    sendWeeklyDigest.mockRejectedValueOnce(new Error("SMTP unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          recipientEmail: "test@example.com",
          mode: "combined",
        }),
      }),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Unable to send the test email.",
    });
    expect(consoleError).toHaveBeenCalled();
  });

  it("reports admin status and requires authentication", async () => {
    await expect((await GET(new Request("http://localhost"))).json()).resolves.toEqual({
      isAdmin: true,
    });

    getSession.mockResolvedValueOnce(null);
    expect((await GET(new Request("http://localhost"))).status).toBe(401);
  });

  it("forbids test sends from non-admin accounts", async () => {
    rowsByTable.set(admin, []);
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ recipientEmail: "test@example.com", mode: "combined" }),
      }),
    );
    expect(response.status).toBe(403);
    expect(sendWeeklyDigest).not.toHaveBeenCalled();
  });

  it("requires authentication for test sends", async () => {
    getSession.mockResolvedValueOnce(null);
    const response = await POST(
      new Request("http://localhost", { method: "POST", body: "{}" }),
    );
    expect(response.status).toBe(401);
  });

  it.each([
    ["invalid", "Invalid request body."],
    [JSON.stringify({ recipientEmail: "invalid", mode: "combined" }), "Enter a valid recipient email."],
    [JSON.stringify({ recipientEmail: `a@${"b".repeat(251)}.c`, mode: "combined" }), "Enter a valid recipient email."],
    [JSON.stringify({ recipientEmail: "test@example.com", mode: "invalid" }), "Select a valid test email type."],
  ])("rejects invalid input", async (body, error) => {
    const response = await POST(
      new Request("http://localhost", { method: "POST", body }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error });
  });

  it.each([
    ["saved-search", "Save at least one search before sending this test."],
    [
      "repository",
      "Save at least one repository alert before sending this test.",
    ],
  ])("requires content for the selected %s mode", async (mode, error) => {
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ recipientEmail: "test@example.com", mode }),
      }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error });
  });

  it("sends a combined test without mutating delivery state", async () => {
    rowsByTable.set(savedSearch, [
      {
        id: "search-1",
        userId: "admin-1",
        name: "React",
        tech: "React",
        label: "help-wanted",
        sort: "updated",
        linkedPr: "any",
        hacktoberfest: "any",
        createdAt: new Date("2026-08-01T00:00:00Z"),
      },
    ]);
    getRepositoryDigestSource.mockResolvedValueOnce({
      template: { id: "template-1" },
      repositories: [
        {
          id: "repo-1",
          fullName: "acme/repo",
          url: "https://github.com/acme/repo",
          lastIssueIds: "[]",
        },
      ],
    });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ recipientEmail: "test@example.com", mode: "combined" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(sendWeeklyDigest).toHaveBeenCalledWith({
      to: "test@example.com",
      subject: "[Test] 7 open-source issues for you this week",
      html: "<html>Combined</html>",
    });
    expect("update" in database).toBe(false);
  });

  it.each([
    ["saved-search", true, false],
    ["repository", false, true],
  ] as const)("builds only the selected %s content", async (mode, buildsSearch, buildsRepo) => {
    rowsByTable.set(savedSearch, [
      {
        id: "search-1",
        userId: "admin-1",
        createdAt: new Date("2026-08-01T00:00:00Z"),
      },
    ]);
    getRepositoryDigestSource.mockResolvedValueOnce({
      template: { id: "template-1" },
      repositories: [
        {
          id: "repo-1",
          fullName: "acme/repo",
          url: "https://github.com/acme/repo",
          lastIssueIds: "[]",
        },
      ],
    });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ recipientEmail: "test@example.com", mode }),
      }),
    );

    expect(response.status).toBe(200);
    if (buildsRepo) {
      expect(getRepositoryDigestSource).toHaveBeenCalledWith(
        database,
        "admin-1",
        false,
      );
    }
    expect(buildWeeklyDigest).toHaveBeenCalledTimes(buildsSearch ? 1 : 0);
    expect(buildRepositoryDigest).toHaveBeenCalledTimes(buildsRepo ? 1 : 0);
  });
});
