export type ContributionStatus = "open" | "closed" | "merged" | "draft";

export type Contribution = {
  id: string;
  type: "issue" | "pull-request";
  title: string;
  url: string;
  repository: string;
  repositoryUrl: string;
  status: ContributionStatus;
  createdAt: string;
  updatedAt: string;
  opportunity: {
    savedAt: string | null;
    openedAt: string | null;
  } | null;
};

export type ContributionHistoryResponse = {
  contributions: Contribution[];
  totalCount: number;
  page: number;
  hasMore: boolean;
  error?: string;
};
