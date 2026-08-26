import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSession,
  select,
  from,
  where,
  limit,
  getDigestContext,
  deliverWeeklyDigest,
} = vi.hoisted(() => ({
  getSession: vi.fn(),
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  getDigestContext: vi.fn(),
  deliverWeeklyDigest: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/db", () => ({
  getDatabase: () => ({ select }),
}));
vi.mock("@/features/issues/server/digest-delivery", () => ({
  getDigestContext,
  deliverWeeklyDigest,
}));

import { POST } from "@/app/api/digest-trigger/route";

describe("manual digest trigger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSession.mockResolvedValue({ user: { id: "user-1" } });
    select.mockReturnValue({ from });
    from.mockReturnValue({ where });
    where.mockReturnValue({ limit });
    limit.mockResolvedValue([
      { id: "user-1", email: "user@example.com", lastSentAt: null },
    ]);
    getDigestContext.mockResolvedValue({
      weekStart: new Date("2026-08-17T00:00:00.000Z"),
      previousTrends: new Map(),
    });
    deliverWeeklyDigest.mockResolvedValue(true);
  });

  it("requires authentication", async () => {
    getSession.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/digest-trigger", { method: "POST" }),
    );

    expect(response.status).toBe(401);
    expect(select).not.toHaveBeenCalled();
  });

  it("sends the signed-in user's digest", async () => {
    const response = await POST(
      new Request("http://localhost/api/digest-trigger", { method: "POST" }),
    );

    await expect(response.json()).resolves.toEqual({ sent: true });
    expect(deliverWeeklyDigest).toHaveBeenCalledWith(
      expect.anything(),
      { id: "user-1", email: "user@example.com", lastSentAt: null },
      expect.objectContaining({ previousTrends: expect.any(Map) }),
      "https://openissue-dev.vercel.app",
    );
  });

  it("enforces the delivery window and saved-search requirement", async () => {
    limit.mockResolvedValueOnce([
      { id: "user-1", email: "user@example.com", lastSentAt: new Date() },
    ]);
    const limited = await POST(
      new Request("http://localhost/api/digest-trigger", { method: "POST" }),
    );
    limit.mockResolvedValueOnce([
      { id: "user-1", email: "user@example.com", lastSentAt: null },
    ]);
    deliverWeeklyDigest.mockResolvedValueOnce(false);
    const noSearches = await POST(
      new Request("http://localhost/api/digest-trigger", { method: "POST" }),
    );

    expect(limited.status).toBe(429);
    expect(noSearches.status).toBe(400);
  });

  it("handles missing accounts and delivery failures", async () => {
    limit.mockResolvedValueOnce([]);
    const missing = await POST(
      new Request("http://localhost/api/digest-trigger", { method: "POST" }),
    );
    expect(missing.status).toBe(404);

    limit.mockResolvedValueOnce([
      { id: "user-1", email: "user@example.com", lastSentAt: null },
    ]);
    deliverWeeklyDigest.mockRejectedValueOnce(new Error("SMTP unavailable"));
    const failed = await POST(
      new Request("http://localhost/api/digest-trigger", { method: "POST" }),
    );
    expect(failed.status).toBe(502);
  });
});
