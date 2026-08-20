import "server-only";

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/lib/auth-schema";

let client: ReturnType<typeof createClient> | undefined;
let database: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb() {
  if (client) {
    return client;
  }

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    throw new Error(
      "TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set to use the database.",
    );
  }

  client = createClient({ url, authToken });
  return client;
}

export function getDatabase() {
  database ??= drizzle(getDb(), { schema });
  return database;
}
