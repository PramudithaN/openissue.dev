import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createClient, drizzle } = vi.hoisted(() => ({
  createClient: vi.fn(),
  drizzle: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@libsql/client", () => ({ createClient }));
vi.mock("drizzle-orm/libsql", () => ({ drizzle }));
vi.mock("@/lib/auth-schema", () => ({ user: { id: "user.id" } }));

beforeEach(() => {
  vi.resetModules();
  createClient.mockReset();
  drizzle.mockReset();
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

    expect(getDb()).toBe(client);
    expect(getDb()).toBe(client);
    expect(createClient).toHaveBeenCalledOnce();
    expect(createClient).toHaveBeenCalledWith({
      url: "libsql://example.turso.io",
      authToken: "test-token",
    });
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
    expect(drizzle).toHaveBeenCalledWith(client, {
      schema: { user: { id: "user.id" } },
    });
  });
});
