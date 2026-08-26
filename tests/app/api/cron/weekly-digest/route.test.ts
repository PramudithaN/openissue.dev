import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  select,
  from,
  insert,
  values,
  onConflictDoNothing,
  update,
  set,
  updateWhere,
  buildWeeklyDigest,
  sendWeeklyDigest,
  getDigestContext,
  deliverWeeklyDigest,
  getRepositoryAlertSchedule,
  isRepositoryAlertDue,
  userRows,
} = vi.hoisted(() => ({
  select: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  onConflictDoNothing: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  updateWhere: vi.fn(),
  buildWeeklyDigest: vi.fn(),
  sendWeeklyDigest: vi.fn(),
  getDigestContext: vi.fn(),
  deliverWeeklyDigest: vi.fn(),
  getRepositoryAlertSchedule: vi.fn(),
  isRepositoryAlertDue: vi.fn(),
  userRows: {
    value: [{ id: "user-1", email: "user@example.com" }] as Array<{
      id: string;
      email: string;
      weeklyDigestLastSentAt?: Date;
    }>,
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  getDatabase: () => ({ select, insert, update }),
}));
vi.mock("@/features/issues/server/weekly-digest", () => ({
  buildWeeklyDigest,
  getWeekStart: () => new Date("2026-08-24T00:00:00.000Z"),
  sendWeeklyDigest,
}));
vi.mock("@/features/issues/server/digest-delivery", () => ({
  getDigestContext,
  deliverWeeklyDigest,
  getRepositoryAlertSchedule,
  isRepositoryAlertDue,
}));

import { GET } from "@/app/api/cron/weekly-digest/route";
import { digestTrendSnapshot, savedSearch, user } from "@/lib/auth-schema";

const search = {
  id: "saved-1",
  userId: "user-1",
  name: "React docs",
  tech: "React",
  label: "documentation",
  sort: "updated",
  linkedPr: "any",
  hacktoberfest: "any",
  createdAt: new Date("2026-08-20T00:00:00.000Z"),
};

describe("weekly digest cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T09:00:00.000Z"));
    vi.stubEnv("CRON_SECRET", "cron-secret");
    select.mockReturnValue({ from });
    from.mockImplementation((table) => {
      const result =
        table === digestTrendSnapshot
          ? []
          : table === user
            ? userRows.value
            : table === savedSearch
              ? [search]
              : [];
      const where = vi.fn().mockResolvedValue(result);
      return {
        where,
        leftJoin: vi.fn().mockReturnValue({ where }),
      };
    });
    insert.mockReturnValue({ values });
    values.mockReturnValue({ onConflictDoNothing });
    onConflictDoNothing.mockResolvedValue(undefined);
    update.mockReturnValue({ set });
    set.mockReturnValue({ where: updateWhere });
    updateWhere.mockResolvedValue(undefined);
    buildWeeklyDigest.mockResolvedValue({
      subject: "Weekly digest",
      html: "<p>Digest</p>",
      issueCount: 1,
      trends: [
        {
          searchKey: "search-key",
          weekStart: new Date("2026-08-17T00:00:00.000Z"),
          issueCount: 12,
          topRepository: "acme/repo",
          topRepositoryIssueCount: 3,
        },
      ],
    });
    sendWeeklyDigest.mockResolvedValue(undefined);
    getDigestContext.mockResolvedValue({
      weekStart: new Date("2026-08-17T00:00:00.000Z"),
      previousTrends: new Map(),
    });
    deliverWeeklyDigest.mockResolvedValue(true);
    getRepositoryAlertSchedule.mockResolvedValue({
      enabled: true,
      frequency: "daily",
      lastSentAt: null,
    });
    isRepositoryAlertDue.mockReturnValue(true);
    userRows.value = [{ id: "user-1", email: "user@example.com" }];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("requires the cron bearer token", async () => {
    const response = await GET(new Request("http://localhost/api/cron/weekly-digest"));

    expect(response.status).toBe(401);
    expect(select).not.toHaveBeenCalled();
  });

  it("stores GitHub trends and sends the digest", async () => {
    const response = await GET(
      new Request("http://localhost/api/cron/weekly-digest", {
        headers: { Authorization: "Bearer cron-secret" },
      }),
    );

    await expect(response.json()).resolves.toEqual({
      recipients: 1,
      sent: 1,
      failed: 0,
    });
    expect(deliverWeeklyDigest).toHaveBeenCalledWith(
      expect.anything(),
      { id: "user-1", email: "user@example.com" },
      expect.objectContaining({ previousTrends: expect.any(Map) }),
      "https://openissue-dev.vercel.app",
      {
        includeSavedSearches: true,
        includeRepositoryAlerts: true,
      },
    );
  });

  it("counts delivery failures without failing the cron response", async () => {
    deliverWeeklyDigest.mockRejectedValueOnce(new Error("SMTP unavailable"));
    const response = await GET(
      new Request("http://localhost/api/cron/weekly-digest", {
        headers: { Authorization: "Bearer cron-secret" },
      }),
    );

    await expect(response.json()).resolves.toEqual({
      recipients: 1,
      sent: 0,
      failed: 1,
    });
  });

  it("skips recipients when neither alert schedule is due", async () => {
    vi.setSystemTime(new Date("2026-08-25T09:00:00.000Z"));
    getRepositoryAlertSchedule.mockResolvedValueOnce(null);
    const response = await GET(
      new Request("http://localhost/api/cron/weekly-digest", {
        headers: { Authorization: "Bearer cron-secret" },
      }),
    );

    await expect(response.json()).resolves.toEqual({
      recipients: 1,
      sent: 0,
      failed: 0,
    });
    expect(deliverWeeklyDigest).not.toHaveBeenCalled();
    expect(isRepositoryAlertDue).not.toHaveBeenCalled();
  });

  it("skips a recent Monday digest when repository alerts are disabled", async () => {
    userRows.value = [
      {
        id: "user-1",
        email: "user@example.com",
        weeklyDigestLastSentAt: new Date("2026-08-24T08:00:00.000Z"),
      },
    ];
    getRepositoryAlertSchedule.mockResolvedValueOnce({
      enabled: false,
      frequency: "weekly",
      lastSentAt: null,
    });

    await GET(
      new Request("http://localhost/api/cron/weekly-digest", {
        headers: { Authorization: "Bearer cron-secret" },
      }),
    );
    expect(deliverWeeklyDigest).not.toHaveBeenCalled();
  });

  it("does not count an eligible delivery with no changed content", async () => {
    deliverWeeklyDigest.mockResolvedValueOnce(false);
    const response = await GET(
      new Request("http://localhost/api/cron/weekly-digest", {
        headers: { Authorization: "Bearer cron-secret" },
      }),
    );
    await expect(response.json()).resolves.toMatchObject({ sent: 0, failed: 0 });
  });
});
