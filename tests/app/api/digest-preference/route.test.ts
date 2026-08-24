import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, select, from, where, limit, update, set, updateWhere } =
  vi.hoisted(() => ({
    getSession: vi.fn(),
    select: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    update: vi.fn(),
    set: vi.fn(),
    updateWhere: vi.fn(),
  }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/db", () => ({
  getDatabase: () => ({ select, update }),
}));

import { GET, PATCH } from "@/app/api/digest-preference/route";

describe("digest preference API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ user: { id: "user-1" } });
    select.mockReturnValue({ from });
    from.mockReturnValue({ where });
    where.mockReturnValue({ limit });
    limit.mockResolvedValue([{ enabled: true, alertEmail: null }]);
    update.mockReturnValue({ set });
    set.mockReturnValue({ where: updateWhere });
    updateWhere.mockResolvedValue(undefined);
  });

  it("requires authentication", async () => {
    getSession.mockResolvedValue(null);

    expect((await GET(new Request("http://localhost"))).status).toBe(401);
    expect(
      (
        await PATCH(
          new Request("http://localhost", {
            method: "PATCH",
            body: JSON.stringify({ enabled: true }),
          }),
        )
      ).status,
    ).toBe(401);
  });

  it("loads and updates the preference", async () => {
    const getResponse = await GET(new Request("http://localhost"));
    const patchResponse = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ enabled: false }),
      }),
    );

    await expect(getResponse.json()).resolves.toEqual({
      enabled: true,
      alertEmail: null,
    });
    await expect(patchResponse.json()).resolves.toEqual({ enabled: false });
    expect(set).toHaveBeenCalledWith({
      weeklyDigestEnabled: false,
      weeklyDigestLastSentAt: null,
    });
  });

  it("stores and clears an alternate alert email", async () => {
    const saveResponse = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ alertEmail: " Alerts@Example.com " }),
      }),
    );
    await expect(saveResponse.json()).resolves.toEqual({
      alertEmail: "alerts@example.com",
    });
    expect(set).toHaveBeenLastCalledWith({ alertEmail: "alerts@example.com" });

    await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ alertEmail: "" }),
      }),
    );
    expect(set).toHaveBeenLastCalledWith({ alertEmail: null });
  });

  it("rejects invalid payloads", async () => {
    const invalidJson = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: "invalid" }),
    );
    const invalidPreference = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ enabled: "yes" }),
      }),
    );
    const invalidEmail = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ alertEmail: "not-an-email" }),
      }),
    );
    const nonStringEmail = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ alertEmail: 42 }),
      }),
    );
    const emptyPreference = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({}),
      }),
    );

    expect(invalidJson.status).toBe(400);
    expect(invalidPreference.status).toBe(400);
    expect(invalidEmail.status).toBe(400);
    expect(nonStringEmail.status).toBe(400);
    expect(emptyPreference.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    `${"a".repeat(245)}@example.com`,
    "alerts @example.com",
    "alerts@@example.com",
    "alerts@example",
    "alerts@example.",
  ])("rejects structurally invalid alert email %s", async (alertEmail) => {
    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ alertEmail }),
      }),
    );
    expect(response.status).toBe(400);
  });

  it("returns defaults when the account preference row is unavailable", async () => {
    limit.mockResolvedValueOnce([]);
    await expect((await GET(new Request("http://localhost"))).json()).resolves.toEqual({
      enabled: false,
      alertEmail: null,
    });
  });
});
