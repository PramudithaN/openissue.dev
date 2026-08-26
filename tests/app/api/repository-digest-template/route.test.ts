import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, database } = vi.hoisted(() => ({
  getSession: vi.fn(),
  database: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/db", () => ({ getDatabase: () => database }));

import { GET, PUT } from "@/app/api/repository-digest-template/route";

function limitedResult(result: unknown[]) {
  return { from: () => ({ where: () => ({ limit: async () => result }) }) };
}

function orderedResult(result: unknown[]) {
  return { from: () => ({ where: () => ({ orderBy: async () => result }) }) };
}

function directResult(result: unknown[]) {
  return { from: () => ({ where: async () => result }) };
}

describe("repository digest template API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("requires authentication", async () => {
    getSession.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost"))).status).toBe(401);
    expect(
      (
        await PUT(
          new Request("http://localhost", { method: "PUT", body: "{}" }),
        )
      ).status,
    ).toBe(401);
  });

  it("returns a saved template and its ordered repositories", async () => {
    database.select
      .mockReturnValueOnce(
        limitedResult([
          {
            id: "template-1",
            name: "My alerts",
            enabled: true,
            frequency: "daily",
          },
        ]),
      )
      .mockReturnValueOnce(
        orderedResult([{ fullName: "acme/repo", url: "https://github.com/acme/repo" }]),
      );

    const response = await GET(new Request("http://localhost"));
    await expect(response.json()).resolves.toEqual({
      template: {
        name: "My alerts",
        enabled: true,
        frequency: "daily",
        repositories: [
          { fullName: "acme/repo", url: "https://github.com/acme/repo" },
        ],
      },
    });
  });

  it("returns null when no template exists", async () => {
    database.select.mockReturnValueOnce(limitedResult([]));
    await expect((await GET(new Request("http://localhost"))).json()).resolves.toEqual({
      template: null,
    });
  });

  it("rejects malformed and duplicate repository selections", async () => {
    const invalidJson = await PUT(
      new Request("http://localhost", { method: "PUT", body: "invalid" }),
    );
    const invalidTemplate = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        body: JSON.stringify({
          name: "Alerts",
          enabled: true,
          frequency: "hourly",
          repositories: [],
        }),
      }),
    );
    const duplicate = {
      fullName: "acme/repo",
      url: "https://github.com/acme/repo",
    };
    const duplicateTemplate = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        body: JSON.stringify({
          name: "Alerts",
          enabled: true,
          frequency: "weekly",
          repositories: [duplicate, duplicate],
        }),
      }),
    );

    expect(invalidJson.status).toBe(400);
    expect(invalidTemplate.status).toBe(400);
    expect(duplicateTemplate.status).toBe(400);
  });

  it.each([
    { name: "", enabled: true, frequency: "weekly", repositories: [] },
    { name: "Alerts", enabled: "yes", frequency: "weekly", repositories: [] },
    {
      name: "Alerts",
      enabled: true,
      frequency: "weekly",
      repositories: [{ fullName: "invalid", url: "https://github.com/invalid" }],
    },
    {
      name: "Alerts",
      enabled: true,
      frequency: "weekly",
      repositories: [
        { fullName: "acme/repo", url: "https://example.com/acme/repo" },
      ],
    },
    { name: 42, enabled: true, frequency: "weekly", repositories: [] },
    { name: "Alerts", enabled: true, frequency: "weekly", repositories: [42] },
  ])("rejects unsafe template fields", async (body) => {
    const response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    );
    expect(response.status).toBe(400);
  });

  it("creates an empty disabled template", async () => {
    database.select
      .mockReturnValueOnce(limitedResult([]))
      .mockReturnValueOnce(
        limitedResult([
          {
            id: "new-template",
            name: "Later",
            enabled: false,
            frequency: "fortnightly",
          },
        ]),
      )
      .mockReturnValueOnce(orderedResult([]));
    database.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    });
    database.delete.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });

    const response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        body: JSON.stringify({
          name: "Later",
          enabled: false,
          frequency: "fortnightly",
          repositories: [],
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(database.insert).toHaveBeenCalledOnce();
  });

  it("updates a template while preserving issue snapshots", async () => {
    database.select
      .mockReturnValueOnce(limitedResult([{ id: "template-1" }]))
      .mockReturnValueOnce(
        directResult([{ fullName: "acme/repo", lastIssueIds: '["issue-1"]' }]),
      )
      .mockReturnValueOnce(
        limitedResult([
          { id: "template-1", name: "Alerts", enabled: true, frequency: "weekly" },
        ]),
      )
      .mockReturnValueOnce(
        orderedResult([{ fullName: "acme/repo", url: "https://github.com/acme/repo" }]),
      );
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    database.insert
      .mockReturnValueOnce({ values })
      .mockReturnValueOnce({ values: vi.fn().mockResolvedValue(undefined) });
    database.delete.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });

    const response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        body: JSON.stringify({
          name: "Alerts",
          enabled: true,
          frequency: "weekly",
          repositories: [
            { fullName: "acme/repo", url: "https://github.com/acme/repo" },
            { fullName: "acme/new", url: "https://github.com/acme/new" },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(database.insert).toHaveBeenCalledTimes(2);
    expect(database.update).not.toHaveBeenCalled();
  });
});
