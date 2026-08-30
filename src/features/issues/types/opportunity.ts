export type Opportunity = {
  id: string;
  repositoryFullName: string;
  issueNumber: number;
  issueUrl: string;
  title: string;
  savedAt: string | null;
  openedAt: string | null;
};

export type OpportunityAction = "open" | "save" | "unsave";
