"use client";

import { useEffect, useState } from "react";
import { Mail, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getRepositoryDigestTemplate,
  saveRepositoryDigestTemplate,
  searchRepositories,
  updateRepositoryDigestTemplateEnabled,
  type RepositoryDigestTemplate,
} from "@/features/issues/lib/repository-digest-cloud";
import type { RepositorySuggestion } from "@/features/issues/types/search";

const EMPTY_TEMPLATE: RepositoryDigestTemplate = {
  name: "Repository alerts",
  enabled: true,
  frequency: "weekly",
  repositories: [],
};

export function RepositoryDigestCard() {
  const [template, setTemplate] = useState(EMPTY_TEMPLATE);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<RepositorySuggestion[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(true);
  const [hasSavedTemplate, setHasSavedTemplate] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getRepositoryDigestTemplate()
      .then((saved) => {
        if (!cancelled && saved) {
          setTemplate(saved);
          setHasSavedTemplate(true);
        }
      })
      .catch(() => {
        if (!cancelled) setMessage("Unable to load repository alerts.");
      })
      .finally(() => {
        if (!cancelled) setIsLoadingTemplate(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2 || template.repositories.length >= 5) {
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void searchRepositories(trimmedQuery)
        .then((repositories) => {
          if (!cancelled) {
            const selected = new Set(
              template.repositories.map((repository) =>
                repository.fullName.toLowerCase(),
              ),
            );
            setSuggestions(
              repositories.filter(
                (repository) => !selected.has(repository.fullName.toLowerCase()),
              ),
            );
          }
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [query, template.repositories]);

  function addRepository(repository: RepositorySuggestion) {
    setTemplate((current) => ({
      ...current,
      repositories: [
        ...current.repositories,
        { fullName: repository.fullName, url: repository.url },
      ],
    }));
    setQuery("");
    setSuggestions([]);
    setMessage(null);
  }

  async function saveTemplate() {
    setIsSaving(true);
    setMessage(null);
    try {
      setTemplate(await saveRepositoryDigestTemplate(template));
      setHasSavedTemplate(true);
      setMessage("Repository alert template saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save template.");
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleAlerts() {
    const previousTemplate = template;
    const updatedTemplate = { ...template, enabled: !template.enabled };
    setTemplate(updatedTemplate);
    if (!hasSavedTemplate) {
      setMessage(null);
      return;
    }
    setIsSaving(true);
    setMessage(null);
    try {
      const enabled = await updateRepositoryDigestTemplateEnabled(
        updatedTemplate.enabled,
      );
      setTemplate((current) => ({ ...current, enabled }));
      setMessage(
        updatedTemplate.enabled
          ? "Repository alerts enabled."
          : "Repository alerts disabled.",
      );
    } catch (error) {
      setTemplate((current) => ({
        ...current,
        enabled: previousTemplate.enabled,
      }));
      setMessage(error instanceof Error ? error.message : "Unable to save template.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Repository alerts</CardTitle>
        <CardDescription>
          Add up to five repositories. Each digest includes their five newest
          open issues and skips unchanged results.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          value={template.name}
          onChange={(event) =>
            setTemplate((current) => ({ ...current, name: event.target.value }))
          }
          maxLength={100}
          aria-label="Repository alert template name"
        />

        <Select
          value={template.frequency}
          onValueChange={(frequency: "daily" | "weekly" | "fortnightly") =>
            setTemplate((current) => ({ ...current, frequency }))
          }
        >
          <SelectTrigger className="w-full" aria-label="Repository alert frequency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="fortnightly">Every fortnight</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search GitHub repositories"
            aria-label="Search GitHub repositories"
            disabled={template.repositories.length >= 5}
            autoComplete="off"
          />
          {query.trim().length >= 2 && suggestions.length ? (
            <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
              {suggestions.map((repository) => (
                <button
                  key={repository.fullName}
                  type="button"
                  className="flex w-full items-start gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent"
                  onClick={() => addRepository(repository)}
                >
                  <Plus className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {repository.fullName}
                    </span>
                    {repository.description ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {repository.description}
                      </span>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          {template.repositories.map((repository) => (
            <div
              key={repository.fullName}
              className="flex items-center gap-2 rounded-md border p-2"
            >
              <a
                href={repository.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
              >
                {repository.fullName}
              </a>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${repository.fullName}`}
                onClick={() =>
                  setTemplate((current) => ({
                    ...current,
                    repositories: current.repositories.filter(
                      (item) => item.fullName !== repository.fullName,
                    ),
                  }))
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full gap-2"
          disabled={isSaving || isLoadingTemplate}
          onClick={() => void toggleAlerts()}
        >
          <Mail className="h-4 w-4" />
          {template.enabled ? "Disable repository alerts" : "Enable repository alerts"}
        </Button>
        <Button
          type="button"
          className="w-full"
          disabled={isSaving || !template.name.trim()}
          onClick={() => void saveTemplate()}
        >
          {isSaving ? "Saving..." : "Save template"}
        </Button>
        {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
      </CardContent>
    </Card>
  );
}
