import "server-only";

import {
  createClient,
  type Client,
  type InArgs,
  type InStatement,
  type Transaction,
  type TransactionMode,
} from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/lib/auth-schema";

const DDL_KEYWORD_PATTERN =
  /\b(?:ALTER|ANALYZE|ATTACH|CREATE|DETACH|DROP|PRAGMA|REINDEX|TRUNCATE|VACUUM)\b/i;
const SQL_DELIMITERS: Readonly<Record<string, string>> = {
  "'": "'",
  '"': '"',
  "`": "`",
  "[": "]",
};
let client: Client | undefined;
let adminClient: Client | undefined;
let database: ReturnType<typeof drizzle<typeof schema>> | undefined;

function getSql(statement: InStatement | [string, InArgs?]) {
  if (typeof statement === "string") return statement;
  if (Array.isArray(statement)) return statement[0];
  return statement.sql;
}

function skipLineComment(sql: string, start: number) {
  let index = start + 2;
  while (index < sql.length && sql[index] !== "\n" && sql[index] !== "\r") {
    index += 1;
  }
  return index;
}

function skipBlockComment(sql: string, start: number) {
  let index = start + 2;
  while (index < sql.length && !(sql[index] === "*" && sql[index + 1] === "/")) {
    index += 1;
  }
  return Math.min(index + 2, sql.length);
}

function skipQuotedValue(sql: string, start: number, closing: string) {
  let index = start + 1;
  while (index < sql.length) {
    if (sql[index] !== closing) {
      index += 1;
      continue;
    }

    if (closing !== "]" && sql[index + 1] === closing) {
      index += 2;
      continue;
    }

    return index + 1;
  }
  return index;
}

function stripSqlLiteralsAndComments(sql: string) {
  let result = "";
  let index = 0;

  while (index < sql.length) {
    const current = sql[index];
    const next = sql[index + 1];

    if (current === "-" && next === "-") {
      index = skipLineComment(sql, index);
      result += " ";
      continue;
    }

    if (current === "/" && next === "*") {
      index = skipBlockComment(sql, index);
      result += " ";
      continue;
    }

    const closing = SQL_DELIMITERS[current];
    if (closing) {
      index = skipQuotedValue(sql, index, closing);
      result += " ";
      continue;
    }

    result += current;
    index += 1;
  }

  return result;
}

function assertNoDdl(statement: InStatement | [string, InArgs?]) {
  const executableSql = stripSqlLiteralsAndComments(getSql(statement));

  if (DDL_KEYWORD_PATTERN.test(executableSql)) {
    throw new Error("DDL statements are disabled for the runtime database client.");
  }
}

function protectTransaction(transaction: Transaction): Transaction {
  return new Proxy(transaction, {
    get(target, property) {
      if (property === "execute") {
        return async (statement: InStatement) => {
          assertNoDdl(statement);
          return target.execute(statement);
        };
      }

      if (property === "batch") {
        return async (statements: InStatement[]) => {
          statements.forEach(assertNoDdl);
          return target.batch(statements);
        };
      }

      if (property === "executeMultiple") {
        return async (sql: string) => {
          assertNoDdl(sql);
          return target.executeMultiple(sql);
        };
      }

      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function protectClient(runtimeClient: Client): Client {
  return new Proxy(runtimeClient, {
    get(target, property) {
      if (property === "execute") {
        return async (statement: InStatement, args?: InArgs) => {
          assertNoDdl(statement);
          return typeof statement === "string" && args
            ? target.execute(statement, args)
            : target.execute(statement);
        };
      }

      if (property === "batch") {
        return async (
          statements: Array<InStatement | [string, InArgs?]>,
          mode?: Parameters<Client["batch"]>[1],
        ) => {
          statements.forEach(assertNoDdl);
          return target.batch(statements, mode);
        };
      }

      if (property === "executeMultiple") {
        return async (sql: string) => {
          assertNoDdl(sql);
          return target.executeMultiple(sql);
        };
      }

      if (property === "migrate") {
        return async () => {
          throw new Error("Database migrations are disabled at application runtime.");
        };
      }

      if (property === "transaction") {
        return async (mode?: TransactionMode) =>
          protectTransaction(await target.transaction(mode));
      }

      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

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

  adminClient = createClient({ url, authToken });
  client = protectClient(adminClient);
  return client;
}

export async function getAdminDb(request: Request) {
  const { auth } = await import("@/lib/auth");
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    throw new Error("Authentication is required for database administration.");
  }

  const [adminRow] = await getDatabase()
    .select({ userId: schema.admin.userId })
    .from(schema.admin)
    .where(eq(schema.admin.userId, session.user.id))
    .limit(1);

  if (!adminRow) {
    throw new Error("Administrator access is required for DDL statements.");
  }

  getDb();
  if (!adminClient) {
    throw new Error("The administrative database client is unavailable.");
  }
  return adminClient;
}

export function getDatabase() {
  database ??= drizzle(getDb(), { schema });
  return database;
}
