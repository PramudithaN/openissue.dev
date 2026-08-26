import { eq } from "drizzle-orm";
import {
  deliverWeeklyDigest,
  getDigestContext,
} from "@/features/issues/server/digest-delivery";
import { auth } from "@/lib/auth";
import { user } from "@/lib/auth-schema";
import { getDatabase } from "@/lib/db";

const SIX_DAYS_IN_MS = 6 * 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const database = getDatabase();
  const [recipient] = await database
    .select({
      id: user.id,
      email: user.email,
      alertEmail: user.alertEmail,
      lastSentAt: user.weeklyDigestLastSentAt,
    })
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);

  if (!recipient) {
    return Response.json({ error: "Account not found." }, { status: 404 });
  }

  if (
    recipient.lastSentAt &&
    recipient.lastSentAt.getTime() > Date.now() - SIX_DAYS_IN_MS
  ) {
    return Response.json(
      { error: "A weekly digest was already sent recently." },
      { status: 429 },
    );
  }

  try {
    const sent = await deliverWeeklyDigest(
      database,
      recipient,
      await getDigestContext(database),
      process.env.BETTER_AUTH_URL ?? "https://openissue-dev.vercel.app",
    );

    if (!sent) {
      return Response.json(
        { error: "Save a search or repository alert before sending a digest." },
        { status: 400 },
      );
    }

    return Response.json({ sent: true });
  } catch (error) {
    console.error("Unable to manually send weekly digest.", error);
    return Response.json({ error: "Unable to send the weekly digest." }, { status: 502 });
  }
}
