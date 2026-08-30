import { desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { opportunity, savedSearch } from "@/lib/auth-schema";
import { getDatabase } from "@/lib/db";
import { buildPersonalizedRecommendations } from "@/features/issues/server/personalized-recommendations";
import { isSearchRateLimited } from "@/features/issues/server/search-rate-limit";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const searchIds = new URL(request.url).searchParams.getAll("searchId");

  if (searchIds.length > 1) {
    return Response.json(
      { error: "Select one saved search." },
      { status: 400 },
    );
  }
  const selectedSearchId = searchIds[0];
  const database = getDatabase();

  const [searches, opportunities] = await Promise.all([
    database
      .select()
      .from(savedSearch)
      .where(eq(savedSearch.userId, session.user.id))
      .orderBy(desc(savedSearch.createdAt)),
    database
      .select({
        issueUrl: opportunity.issueUrl,
        repositoryFullName: opportunity.repositoryFullName,
      })
      .from(opportunity)
      .where(eq(opportunity.userId, session.user.id)),
  ]);

  try {
    const selectedSearch = selectedSearchId
      ? searches.find((search) => search.id === selectedSearchId)
      : searches[0];

    if (selectedSearchId && !selectedSearch) {
      return Response.json({ error: "Saved search not found." }, { status: 404 });
    }

    if (isSearchRateLimited(`user:${session.user.id}`)) {
      return Response.json(
        {
          error:
            "Too many recommendation requests. Please slow down and try again in a minute.",
        },
        { status: 429 },
      );
    }

    const result = await buildPersonalizedRecommendations(
      selectedSearch
        ? [
            {
              id: selectedSearch.id,
              name: selectedSearch.name,
              tech: selectedSearch.tech,
              label: selectedSearch.label,
              sort: selectedSearch.sort,
              linkedPr: selectedSearch.linkedPr,
              hacktoberfest: selectedSearch.hacktoberfest,
              createdAt: selectedSearch.createdAt.toISOString(),
            },
          ]
        : [],
      opportunities,
    );

    return Response.json(result);
  } catch {
    return Response.json(
      { error: "Unable to load recommendations from GitHub." },
      { status: 502 },
    );
  }
}
