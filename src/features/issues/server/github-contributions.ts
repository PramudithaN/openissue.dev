import "server-only";

import type {
  Contribution,
  ContributionHistoryResponse,
} from "@/features/issues/types/contribution";

const PAGE_SIZE = 30;

type GitHubUser = {
  login: string;
};

type GitHubContribution = {
  html_url: string;
  title: string;
  state: "open" | "closed";
  draft?: boolean;
  created_at: string;
  updated_at: string;
  repository_url: string;
  pull_request?: {
    merged_at: string | null;
  };
};

type GitHubContributionSearchResponse = {
  total_count: number;
  items: GitHubContribution[];
};

async function githubFetch<T>(url: string, accessToken: string) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`GitHub API error ${response.status}`);
  }

  return (await response.json()) as T;
}

function getRepositoryName(repositoryUrl: string) {
  return repositoryUrl.split("/repos/").at(-1) ?? repositoryUrl;
}

function mapContribution(item: GitHubContribution): Contribution {
  const repository = getRepositoryName(item.repository_url);
  const isPullRequest = Boolean(item.pull_request);
  let status: Contribution["status"] = item.state;

  if (item.pull_request?.merged_at) {
    status = "merged";
  } else if (isPullRequest && item.draft && item.state === "open") {
    status = "draft";
  }

  return {
    id: item.html_url,
    type: isPullRequest ? "pull-request" : "issue",
    title: item.title,
    url: item.html_url,
    repository,
    repositoryUrl: `https://github.com/${repository}`,
    status,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    opportunity: null,
  };
}

export async function getGitHubContributionHistory(
  accessToken: string,
  page: number,
): Promise<ContributionHistoryResponse> {
  const user = await githubFetch<GitHubUser>(
    "https://api.github.com/user",
    accessToken,
  );
  const url = new URL("https://api.github.com/search/issues");
  url.searchParams.set("q", `author:${user.login}`);
  url.searchParams.set("sort", "updated");
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", String(PAGE_SIZE));
  url.searchParams.set("page", String(page));

  const result = await githubFetch<GitHubContributionSearchResponse>(
    url.toString(),
    accessToken,
  );

  return {
    contributions: result.items.map(mapContribution),
    totalCount: result.total_count,
    page,
    hasMore: page * PAGE_SIZE < Math.min(result.total_count, 1_000),
  };
}
