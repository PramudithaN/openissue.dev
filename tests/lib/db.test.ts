import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createClient, drizzle, getSession } = vi.hoisted(() => ({
  createClient: vi.fn(),
  drizzle: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@libsql/client", () => ({ createClient }));
vi.mock("drizzle-orm/libsql", () => ({ drizzle }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/auth-schema", () => ({
  admin: { userId: "admin.userId" },
  user: { id: "user.id" },
}));

beforeEach(() => {
  vi.resetModules();
  createClient.mockReset();
  drizzle.mockReset();
  getSession.mockReset();
  process.env.TURSO_DATABASE_URL = "libsql://example.turso.io";
  process.env.TURSO_AUTH_TOKEN = "test-token";
});

afterEach(() => {
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
});

describe("database client", () => {
  it("requires both Turso environment variables", async () => {
    delete process.env.TURSO_AUTH_TOKEN;
    const { getDb } = await import("@/lib/db");

    expect(() => getDb()).toThrow(
      "TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set",
    );
  });

  it("creates and reuses the libSQL client", async () => {
    const client = { execute: vi.fn() };
    createClient.mockReturnValue(client);
    const { getDb } = await import("@/lib/db");
    const protectedClient = getDb();

    expect(protectedClient).not.toBe(client);
    expect(getDb()).toBe(protectedClient);
    expect(createClient).toHaveBeenCalledOnce();
    expect(createClient).toHaveBeenCalledWith({
      url: "libsql://example.turso.io",
      authToken: "test-token",
    });

    await protectedClient.execute("SELECT 1");
    expect(client.execute).toHaveBeenCalledWith("SELECT 1");
  });

  it("creates and reuses the Drizzle database", async () => {
    const client = { execute: vi.fn() };
    const database = { select: vi.fn() };
    createClient.mockReturnValue(client);
    drizzle.mockReturnValue(database);
    const { getDatabase } = await import("@/lib/db");

    expect(getDatabase()).toBe(database);
    expect(getDatabase()).toBe(database);
    expect(drizzle).toHaveBeenCalledOnce();
    expect(drizzle).toHaveBeenCalledWith(expect.not.objectContaining(client), {
      schema: {
        admin: { userId: "admin.userId" },
        user: { id: "user.id" },
      },
    });
  });

  it.each([
    "CREATE TABLE audit_log (id INTEGER)",
    "ALTER TABLE user ADD COLUMN admin INTEGER",
    "DROP TABLE user",
    "TRUNCATE TABLE user",
    "PRAGMA writable_schema = 1",
    "VACUUM",
    "REINDEX user",
    "ATTACH DATABASE 'other.db' AS other",
    "DETACH DATABASE other",
    "ANALYZE user",
  ])("blocks runtime schema command: %s", async (sql) => {
    const client = { execute: vi.fn() };
    createClient.mockReturnValue(client);
    const { getDb } = await import("@/lib/db");

    await expect(getDb().execute(sql)).rejects.toThrow(
      "DDL statements are disabled",
    );
    expect(client.execute).not.toHaveBeenCalled();
  });

  it("blocks DDL in batches, scripts, migrations, and transactions", async () => {
    const transaction = {
      execute: vi.fn(),
      batch: vi.fn(),
      executeMultiple: vi.fn(),
    };
    const client = {
      execute: vi.fn(),
      batch: vi.fn(),
      executeMultiple: vi.fn(),
      migrate: vi.fn(),
      transaction: vi.fn().mockResolvedValue(transaction),
    };
    createClient.mockReturnValue(client);
    const { getDb } = await import("@/lib/db");
    const protectedClient = getDb();

    await expect(
      protectedClient.batch(["SELECT 1", "DROP TABLE user"]),
    ).rejects.toThrow("DDL statements are disabled");
    await expect(
      protectedClient.executeMultiple("SELECT 1; CREATE TABLE unsafe (id INTEGER)"),
    ).rejects.toThrow("DDL statements are disabled");
    await expect(protectedClient.migrate(["SELECT 1"])).rejects.toThrow(
      "migrations are disabled",
    );

    const protectedTransaction = await protectedClient.transaction("write");
    await expect(
      protectedTransaction.execute("ALTER TABLE user ADD COLUMN unsafe INTEGER"),
    ).rejects.toThrow("DDL statements are disabled");
    await expect(
      protectedTransaction.batch(["DELETE FROM session", "DROP TABLE session"]),
    ).rejects.toThrow("DDL statements are disabled");
    await expect(
      protectedTransaction.executeMultiple("UPDATE user SET name = 'safe'; VACUUM"),
    ).rejects.toThrow("DDL statements are disabled");

    expect(client.batch).not.toHaveBeenCalled();
    expect(client.executeMultiple).not.toHaveBeenCalled();
    expect(client.migrate).not.toHaveBeenCalled();
    expect(transaction.execute).not.toHaveBeenCalled();
    expect(transaction.batch).not.toHaveBeenCalled();
    expect(transaction.executeMultiple).not.toHaveBeenCalled();
  });

  it("allows DDL words in comments, literals, and bound values", async () => {
    const client = {
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    };
    createClient.mockReturnValue(client);
    const { getDb } = await import("@/lib/db");
    const statement = {
      sql: "SELECT 'DROP TABLE user' AS message /* CREATE TABLE ignored */",
      args: [],
    };

    await expect(getDb().execute(statement)).resolves.toEqual({ rows: [] });
    await expect(
      getDb().execute("INSERT INTO audit_log (message) VALUES (?)", [
        "ALTER TABLE user",
      ]),
    ).resolves.toEqual({ rows: [] });
    await expect(
      getDb().execute(
        "SELECT \"CREATE\", `DROP`, [ALTER], 'it''s PRAGMA' -- VACUUM\n/* REINDEX */ 1",
      ),
    ).resolves.toEqual({ rows: [] });
    expect(client.execute).toHaveBeenCalledTimes(3);
  });

  it("allows DDL only through an authenticated administrator client", async () => {
    const limit = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ userId: "admin-1" }]);
    const database = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit })),
        })),
      })),
    };
    const runtimeClient = {
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    };
    createClient.mockReturnValue(runtimeClient);
    drizzle.mockReturnValue(database);
    const { getAdminDb } = await import("@/lib/db");
    const request = new Request("http://localhost/api/admin/database");

    getSession.mockResolvedValueOnce(null);
    await expect(getAdminDb(request)).rejects.toThrow("Authentication is required");

    getSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    await expect(getAdminDb(request)).rejects.toThrow(
      "Administrator access is required",
    );

    getSession.mockResolvedValueOnce({ user: { id: "admin-1" } });
    const privilegedClient = await getAdminDb(request);
    await privilegedClient.execute("CREATE TABLE admin_audit (id INTEGER)");

    expect(runtimeClient.execute).toHaveBeenCalledWith(
      "CREATE TABLE admin_audit (id INTEGER)",
    );
  });
});
