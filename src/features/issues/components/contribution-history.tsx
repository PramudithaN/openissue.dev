"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, CircleDot, GitPullRequest } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getContributionHistory } from "@/features/issues/lib/contribution-history-cloud";
import { relativeDate } from "@/features/issues/lib/format";
import type { Contribution } from "@/features/issues/types/contribution";

const STATUS_STYLES: Record<Contribution["status"], string> = {
  open: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  merged: "border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-400",
  draft: "border-muted-foreground/20 bg-muted text-muted-foreground",
  closed: "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-400",
};

export function ContributionHistory() {
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void getContributionHistory()
      .then((history) => {
        if (!cancelled) {
          setContributions(history.contributions);
          setTotalCount(history.totalCount);
          setHasMore(history.hasMore);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load contribution history.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function loadMore() {
    const nextPage = page + 1;
    setIsLoading(true);
    setError(null);

    try {
      const history = await getContributionHistory(nextPage);
      setContributions((current) => [
        ...current,
        ...history.contributions.filter(
          (contribution) =>
            !current.some((existing) => existing.id === contribution.id),
        ),
      ]);
      setPage(nextPage);
      setHasMore(history.hasMore);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load contribution history.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Contribution history</CardTitle>
            <CardDescription>
              Issues and pull requests you opened, ordered by recent activity.
            </CardDescription>
          </div>
          {totalCount ? <Badge variant="secondary">{totalCount} total</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!isLoading && !error && contributions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No public issues or pull requests found.
          </p>
        ) : null}

        {contributions.map((contribution) => {
          const Icon = contribution.type === "pull-request" ? GitPullRequest : CircleDot;

          return (
            <div key={contribution.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="gap-1.5">
                  <Icon className="h-3.5 w-3.5" />
                  {contribution.type === "pull-request" ? "Pull request" : "Issue"}
                </Badge>
                <Badge className={STATUS_STYLES[contribution.status]}>
                  {contribution.status}
                </Badge>
                {contribution.opportunity?.savedAt ? (
                  <Badge variant="secondary">Saved opportunity</Badge>
                ) : null}
                {contribution.opportunity?.openedAt ? (
                  <Badge variant="secondary">Opened from OpenIssue</Badge>
                ) : null}
                <a
                  href={contribution.repositoryUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-muted-foreground hover:text-foreground"
                >
                  {contribution.repository}
                </a>
              </div>
              <a
                href={contribution.url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 flex items-start justify-between gap-3 text-sm font-medium hover:underline"
              >
                <span>{contribution.title}</span>
                <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0" />
              </a>
              <p className="mt-1 text-xs text-muted-foreground">
                Opened {relativeDate(contribution.createdAt)} · Updated{" "}
                {relativeDate(contribution.updatedAt)}
              </p>
            </div>
          );
        })}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading contributions…</p>
        ) : null}
        {hasMore ? (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={isLoading}
            onClick={() => void loadMore()}
          >
            Load more contributions
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
