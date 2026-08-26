import type { RepositorySuggestion } from "@/features/issues/types/search";

export type RepositoryDigestTemplate = {
  name: string;
  enabled: boolean;
  frequency: "daily" | "weekly" | "fortnightly";
  repositories: Array<{ fullName: string; url: string }>;
};

async function jsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Request failed.");
  return payload;
}

export async function getRepositoryDigestTemplate() {
  const payload = await jsonResponse<{ template: RepositoryDigestTemplate | null }>(
    await fetch("/api/repository-digest-template"),
  );
  return payload.template;
}

export async function saveRepositoryDigestTemplate(
  template: RepositoryDigestTemplate,
) {
  const payload = await jsonResponse<{ template: RepositoryDigestTemplate }>(
    await fetch("/api/repository-digest-template", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(template),
    }),
  );
  return payload.template;
}

export async function searchRepositories(query: string) {
  const params = new URLSearchParams({ query });
  const payload = await jsonResponse<{ repositories: RepositorySuggestion[] }>(
    await fetch(`/api/repositories?${params}`),
  );
  return payload.repositories;
}
