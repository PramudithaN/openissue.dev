import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { savedSearch } from "@/lib/auth-schema";
import { getDatabase } from "@/lib/db";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;

  await getDatabase()
    .delete(savedSearch)
    .where(
      and(eq(savedSearch.id, id), eq(savedSearch.userId, session.user.id)),
    );

  return new Response(null, { status: 204 });
}
