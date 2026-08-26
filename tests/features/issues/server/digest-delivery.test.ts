import { beforeEach, describe, expect, it, vi } from "vitest";

const { buildWeeklyDigest, sendWeeklyDigest, buildRepositoryDigest } = vi.hoisted(
  () => ({
    buildWeeklyDigest: vi.fn(),
    sendWeeklyDigest: vi.fn(),
    buildRepositoryDigest: vi.fn(),
  }),
);

vi.mock("server-only", () => ({}));
vi.mock("@/features/issues/server/weekly-digest", () => ({
  buildWeeklyDigest,
  sendWeeklyDigest,
  getWeekStart: () => new Date("2026-08-24T00:00:00.000Z"),
}));
vi.mock("@/features/issues/server/repository-digest", () => ({
  buildRepositoryDigest,
}));

import {
  deliverWeeklyDigest,
  getDigestContext,
  getRepositoryAlertSchedule,
} from "@/features/issues/server/digest-delivery";
import {
  digestTrendSnapshot,
  repositoryDigestRepository,
  repositoryDigestTemplate,
  savedSearch,
} from "@/lib/auth-schema";

function resultChain(rows: unknown[]) {
  const promise = Promise.resolve(rows);
  return {
    limit: async () => rows,
    orderBy: async () => rows,
    then: promise.then.bind(promise),
  };
}

function databaseWith(rowsByTable: Map<unknown, unknown[]>) {
  const where = vi.fn();
  const select = vi.fn().mockReturnValue({
    from: (table: unknown) => ({
      where: () => {
        const chain = resultChain(rowsByTable.get(table) ?? []);
        where(table);
        return chain;
      },
    }),
  });
  const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
  const insertValues = vi.fn().mockReturnValue({ onConflictDoNothing });
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
  return {
    select,
    insert: vi.fn().mockReturnValue({ values: insertValues }),
    update: vi.fn().mockReturnValue({ set: updateSet }),
    where,
    insertValues,
    updateSet,
  };
}

describe("digest delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendWeeklyDigest.mockResolvedValue(undefined);
    buildWeeklyDigest.mockResolvedValue({
      subject: "Weekly digest",
      html: "<p>Saved searches</p>",
      issueCount: 2,
      trends: [
        {
          searchKey: "search-key",
          weekStart: new Date("2026-08-17T00:00:00.000Z"),
          issueCount: 2,
          topRepository: "acme/repo",
          topRepositoryIssueCount: 2,
        },
      ],
    });
    buildRepositoryDigest.mockResolvedValue({
      changed: true,
      issueCount: 1,
      html: "<p>Repositories</p>",
      snapshots: [{ id: "repo-row", issueIds: '["issue-1"]' }],
    });
  });

  it("loads trend and repository scheduling context", async () => {
    const trend = {
      searchKey: "key",
      weekStart: new Date("2026-08-10T00:00:00.000Z"),
    };
    const schedule = { enabled: true, frequency: "daily", lastSentAt: null };
    const database = databaseWith(
      new Map<unknown, unknown[]>([
        [digestTrendSnapshot, [trend]],
        [repositoryDigestTemplate, [schedule]],
      ]),
    );

    const context = await getDigestContext(database as never);
    expect(context.previousTrends.get("key")).toBe(trend);
    await expect(
      getRepositoryAlertSchedule(database as never, "user-1"),
    ).resolves.toEqual(schedule);

    const emptyDatabase = databaseWith(new Map());
    await expect(
      getRepositoryAlertSchedule(emptyDatabase as never, "user-2"),
    ).resolves.toBeNull();
  });

  it("does nothing when the selected delivery has no content", async () => {
    const database = databaseWith(new Map());
    await expect(
      deliverWeeklyDigest(
        database as never,
        { id: "user-1", email: "user@example.com" },
        { weekStart: new Date(), previousTrends: new Map() },
        "https://example.com",
      ),
    ).resolves.toBe(false);
    expect(sendWeeklyDigest).not.toHaveBeenCalled();
  });

  it("skips an unchanged repository-only digest", async () => {
    buildRepositoryDigest.mockResolvedValueOnce({
      changed: false,
      issueCount: 1,
      html: "<p>Repositories</p>",
      snapshots: [],
    });
    const database = databaseWith(
      new Map<unknown, unknown[]>([
        [repositoryDigestTemplate, [{ id: "template-1" }]],
        [repositoryDigestRepository, [{ id: "repo-row" }]],
      ]),
    );
    await expect(
      deliverWeeklyDigest(
        database as never,
        { id: "user-1", email: "user@example.com" },
        { weekStart: new Date(), previousTrends: new Map() },
        "https://example.com",
        { includeSavedSearches: false },
      ),
    ).resolves.toBe(false);
    expect(sendWeeklyDigest).not.toHaveBeenCalled();
  });

  it("combines content, uses the alternate email, and stores successful state", async () => {
    const database = databaseWith(
      new Map<unknown, unknown[]>([
        [
          savedSearch,
          [
            {
              name: "React",
              tech: "React",
              label: "help-wanted",
              sort: "updated",
              linkedPr: "any",
              hacktoberfest: "any",
              createdAt: new Date("2026-08-01T00:00:00Z"),
            },
          ],
        ],
        [repositoryDigestTemplate, [{ id: "template-1" }]],
        [repositoryDigestRepository, [{ id: "repo-row" }]],
      ]),
    );

    await expect(
      deliverWeeklyDigest(
        database as never,
        {
          id: "user-1",
          email: "github@example.com",
          alertEmail: "alerts@example.com",
        },
        { weekStart: new Date(), previousTrends: new Map() },
        "https://example.com",
      ),
    ).resolves.toBe(true);

    expect(sendWeeklyDigest).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "alerts@example.com",
        html: "<p>Saved searches</p><p>Repositories</p>",
      }),
    );
    expect(database.updateSet).toHaveBeenCalledWith({
      lastIssueIds: '["issue-1"]',
    });
    expect(database.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ weeklyDigestLastSentAt: expect.any(Date) }),
    );
    expect(database.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ lastSentAt: expect.any(Date) }),
    );
  });

  it("sends saved-search content alone to the linked email", async () => {
    const database = databaseWith(
      new Map<unknown, unknown[]>([
        [
          savedSearch,
          [
            {
              name: "React",
              tech: "React",
              label: "help-wanted",
              sort: "updated",
              linkedPr: "any",
              hacktoberfest: "any",
              createdAt: new Date("2026-08-01T00:00:00Z"),
            },
          ],
        ],
      ]),
    );

    await expect(
      deliverWeeklyDigest(
        database as never,
        { id: "user-1", email: "github@example.com" },
        { weekStart: new Date(), previousTrends: new Map() },
        "https://example.com",
        { includeRepositoryAlerts: false },
      ),
    ).resolves.toBe(true);
    expect(sendWeeklyDigest).toHaveBeenCalledWith({
      to: "github@example.com",
      subject: "Weekly digest",
      html: "<p>Saved searches</p>",
    });
  });

  it("sends changed repository content without updating saved-search delivery", async () => {
    const database = databaseWith(
      new Map<unknown, unknown[]>([
        [repositoryDigestTemplate, [{ id: "template-1" }]],
        [repositoryDigestRepository, [{ id: "repo-row" }]],
      ]),
    );

    await expect(
      deliverWeeklyDigest(
        database as never,
        { id: "user-1", email: "user@example.com" },
        { weekStart: new Date(), previousTrends: new Map() },
        "https://example.com",
        { includeSavedSearches: false },
      ),
    ).resolves.toBe(true);
    expect(sendWeeklyDigest).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "1 open-source issues for you this week",
        html: "<p>Repositories</p>",
      }),
    );
    expect(database.updateSet).not.toHaveBeenCalledWith(
      expect.objectContaining({ weeklyDigestLastSentAt: expect.any(Date) }),
    );
  });
});
