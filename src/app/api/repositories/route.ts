import { auth } from "@/lib/auth";
import { searchGitHubRepositories } from "@/features/issues/server/github-search";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const query = new URL(request.url).searchParams.get("query")?.trim() ?? "";

  if (query.length < 2 || query.length > 100) {
    return Response.json(
      { error: "Enter at least two characters." },
      { status: 400 },
    );
  }

  try {
    return Response.json({ repositories: await searchGitHubRepositories(query) });
  } catch (error) {
    console.error("Unable to search GitHub repositories.", error);
    return Response.json(
      { error: "Unable to search GitHub repositories." },
      { status: 502 },
    );
  }
}
