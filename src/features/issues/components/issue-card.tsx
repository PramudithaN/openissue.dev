import {
  Activity,
  ArrowUpRight,
  Bookmark,
  Clock3,
  GitPullRequest,
  MessageCircle,
  Star,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { compactNumber, relativeDate } from "@/features/issues/lib/format";
import type {
  Issue,
  RepositoryHealth,
} from "@/features/issues/types/search";

function getQualityBadgeClassName(qualityScore: number) {
  if (qualityScore >= 70) {
    return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20";
  }

  if (qualityScore >= 40) {
    return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20";
  }

  return "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20";
}

function getRepositoryHealthClassName(label: RepositoryHealth["label"]) {
  switch (label) {
    case "active":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
    case "moderate":
      return "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400";
    case "stale":
      return "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-400";
    default:
      return "";
  }
}

function getRepositoryHealthText(health: RepositoryHealth) {
  if (health.score === null) {
    return "Health unknown";
  }

  return `${health.score} ${health.label}`;
}

function RepositoryHealthTooltip({ issue }: Readonly<{ issue: Issue }>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={getRepositoryHealthClassName(issue.repositoryHealth.label)}
          tabIndex={0}
          title={issue.repositoryHealth.signals.join(" · ")}
        >
          <Activity className="h-3 w-3" />
          {getRepositoryHealthText(issue.repositoryHealth)}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="block max-w-sm space-y-2">
        <p className="font-medium">Repository health</p>
        <p>70+ active · 40–69 moderate · below 40 stale</p>
        <ul className="list-disc space-y-1 pl-4">
          {issue.repositoryHealth.signals.map((signal) => (
            <li key={signal}>{signal}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

function QualityTooltip({ issue }: Readonly<{ issue: Issue }>) {
  const healthBoost = Math.round((issue.repositoryHealth.score ?? 0) / 10);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          className={getQualityBadgeClassName(issue.qualityScore)}
          tabIndex={0}
        >
          {issue.qualityScore} quality
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="block max-w-sm space-y-2">
        <p className="font-medium">Issue quality ranking points</p>
        <p>70+ strong · 40–69 promising · below 40 lower confidence</p>
        <p>
          Updated {relativeDate(issue.updatedAt)} ·{" "}
          {compactNumber(issue.stars ?? 0)} stars · {issue.labels.length} labels ·{" "}
          {issue.comments} comments ·{" "}
          {issue.assigned ? "assigned" : "unassigned"}
        </p>
        <p>
          Repository health contributes {healthBoost} points. Scores are not
          percentages.
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

export function IssueCard({
  issue,
  isSaved = false,
  matchSignals = [],
  onOpen,
  onSaveChange,
}: Readonly<{
  issue: Issue;
  isSaved?: boolean;
  matchSignals?: string[];
  onOpen?: (issue: Issue) => void;
  onSaveChange?: (issue: Issue, saved: boolean) => void;
}>) {
  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <a
            href={issue.repoUrl}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {issue.repo}
          </a>
          <div className="flex flex-wrap items-center gap-2">
            <RepositoryHealthTooltip issue={issue} />
            {issue.hacktoberfest ? (
              <Badge className="border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-400">
                {issue.hacktoberfestSource === "repo-topic"
                  ? "Hacktoberfest repo"
                  : "Hacktoberfest label"}
              </Badge>
            ) : null}
            <QualityTooltip issue={issue} />
            {issue.helpStatus === "open" && (
              <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20">
                Needs Help
              </Badge>
            )}
            {issue.helpStatus === "claimed" && (
              <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20">
                Possibly Claimed
              </Badge>
            )}
            {issue.helpStatus === "resolved" && (
              <Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20">
                Likely Resolved
              </Badge>
            )}
          </div>
        </div>
        <CardTitle className="text-lg leading-7">
          <a href={issue.url} target="_blank" rel="noreferrer" className="hover:underline">
            {issue.title}
          </a>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {matchSignals.length > 0 ? (
          <div className="flex flex-wrap gap-2" aria-label="Recommendation matches">
            {matchSignals.map((signal) => (
              <Badge key={signal} variant="secondary">
                {signal}
              </Badge>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {issue.labels.slice(0, 6).map((label) => (
            <Badge key={label} variant="outline">
              {label}
            </Badge>
          ))}
        </div>

        <Separator />

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Star className="h-4 w-4" />
              {issue.stars === null ? "-" : compactNumber(issue.stars)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MessageCircle className="h-4 w-4" />
              {issue.comments}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <GitPullRequest className="h-4 w-4" />
              {issue.linkedPrCount ?? "-"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="h-4 w-4" />
              {relativeDate(issue.updatedAt)}
            </span>
            <span>{issue.assigned ? "Assigned" : "Unassigned"}</span>
          </div>

          <div className="flex gap-2">
            {onSaveChange ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => onSaveChange(issue, !isSaved)}
              >
                <Bookmark className={isSaved ? "h-4 w-4 fill-current" : "h-4 w-4"} />
                {isSaved ? "Saved" : "Save"}
              </Button>
            ) : null}
            <Button asChild size="sm" className="gap-2">
              <a
                href={issue.url}
                target="_blank"
                rel="noreferrer"
                onClick={() => onOpen?.(issue)}
              >
                Open issue
                <ArrowUpRight className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
