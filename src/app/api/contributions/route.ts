import { and, eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { account, opportunity } from "@/lib/auth-schema";
import { getDatabase } from "@/lib/db";
import { getGitHubContributionHistory } from "@/features/issues/server/github-contributions";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const rawPage = new URL(request.url).searchParams.get("page") ?? "1";
  const page = Number(rawPage);

  if (!Number.isInteger(page) || page < 1 || page > 34) {
    return Response.json({ error: "Invalid page." }, { status: 400 });
  }

  const [githubAccount] = await getDatabase()
    .select({ accessToken: account.accessToken })
    .from(account)
    .where(
      and(eq(account.userId, session.user.id), eq(account.providerId, "github")),
    )
    .limit(1);

  if (!githubAccount?.accessToken) {
    return Response.json(
      { error: "Reconnect GitHub to load contribution history." },
      { status: 409 },
    );
  }

  try {
    const history = await getGitHubContributionHistory(
      githubAccount.accessToken,
      page,
    );
    const issueUrls = history.contributions
      .filter((contribution) => contribution.type === "issue")
      .map((contribution) => contribution.url);
    const opportunities = issueUrls.length
      ? await getDatabase()
        .select()
        .from(opportunity)
        .where(
          and(
            eq(opportunity.userId, session.user.id),
            inArray(opportunity.issueUrl, issueUrls),
          ),
        )
      : [];
    const opportunityByUrl = new Map(
      opportunities.map((item) => [item.issueUrl, item] as const),
    );

    return Response.json({
      ...history,
      contributions: history.contributions.map((contribution) => {
        // A PR number can equal an unrelated issue number. Only exact issue URLs
        // prove that the contribution and tracked opportunity are the same item.
        const match =
          contribution.type === "issue"
            ? opportunityByUrl.get(contribution.url)
            : undefined;
        return {
          ...contribution,
          opportunity: match
            ? {
                savedAt: match.savedAt?.toISOString() ?? null,
                openedAt: match.openedAt?.toISOString() ?? null,
              }
            : null,
        };
      }),
    });
  } catch (error) {
    console.error("Unable to load GitHub contribution history.", error);
    return Response.json(
      { error: "Unable to load GitHub contribution history." },
      { status: 502 },
    );
  }
}
