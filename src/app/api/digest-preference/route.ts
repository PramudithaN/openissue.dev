import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { user } from "@/lib/auth-schema";
import { getDatabase } from "@/lib/db";

async function getSession(request: Request) {
  return auth.api.getSession({ headers: request.headers });
}

type PreferenceUpdates = {
  weeklyDigestEnabled?: boolean;
  weeklyDigestLastSentAt?: null;
  alertEmail?: string | null;
};

function normalizeAlertEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!email) return null;
  if (email.length > 254 || [...email].some((character) => character.trim() === "")) {
    return undefined;
  }

  const at = email.indexOf("@");
  const lastAt = email.lastIndexOf("@");
  const dot = email.lastIndexOf(".");
  if (at <= 0 || at !== lastAt || dot <= at + 1 || dot === email.length - 1) {
    return undefined;
  }

  return email;
}

function getPreferenceUpdates(input: {
  enabled?: unknown;
  alertEmail?: unknown;
} | null): { updates?: PreferenceUpdates; error?: string } {
  const enabled = input?.enabled;
  const rawAlertEmail = input?.alertEmail;
  if (enabled !== undefined && typeof enabled !== "boolean") {
    return { error: "Invalid digest preference." };
  }
  if (rawAlertEmail !== undefined && typeof rawAlertEmail !== "string") {
    return { error: "Invalid alert email." };
  }
  if (enabled === undefined && rawAlertEmail === undefined) {
    return { error: "No preference supplied." };
  }

  const updates: PreferenceUpdates = {};
  if (typeof rawAlertEmail === "string") {
    const alertEmail = normalizeAlertEmail(rawAlertEmail);
    if (alertEmail === undefined) return { error: "Enter a valid alert email." };
    updates.alertEmail = alertEmail;
  }
  if (typeof enabled === "boolean") {
    updates.weeklyDigestEnabled = enabled;
    if (!enabled) updates.weeklyDigestLastSentAt = null;
  }
  return { updates };
}

export async function GET(request: Request) {
  const session = await getSession(request);

  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const [preference] = await getDatabase()
    .select({
      enabled: user.weeklyDigestEnabled,
      alertEmail: user.alertEmail,
    })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);

  return Response.json({
    enabled: preference?.enabled ?? false,
    alertEmail: preference?.alertEmail ?? null,
  });
}

export async function PATCH(request: Request) {
  const session = await getSession(request);

  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const input = body as {
    enabled?: unknown;
    alertEmail?: unknown;
  } | null;
  const { updates, error } = getPreferenceUpdates(input);
  if (error || !updates) {
    return Response.json({ error }, { status: 400 });
  }

  await getDatabase()
    .update(user)
    .set(updates)
    .where(eq(user.id, session.user.id));

  return Response.json({
    enabled:
      typeof updates.weeklyDigestEnabled === "boolean"
        ? updates.weeklyDigestEnabled
        : undefined,
    alertEmail: updates.alertEmail,
  });
}
