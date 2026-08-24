import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import {
  repositoryDigestRepository,
  repositoryDigestTemplate,
} from "@/lib/auth-schema";
import { getDatabase } from "@/lib/db";

const MAX_REPOSITORIES = 5;
const FREQUENCIES = new Set(["daily", "weekly", "fortnightly"]);
const REPOSITORY_NAME_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

type RepositoryInput = { fullName: string; url: string };

function isRepository(value: unknown): value is RepositoryInput {
  if (!value || typeof value !== "object") return false;
  const repository = value as Partial<RepositoryInput>;
  return (
    typeof repository.fullName === "string" &&
    REPOSITORY_NAME_PATTERN.test(repository.fullName) &&
    typeof repository.url === "string" &&
    repository.url === `https://github.com/${repository.fullName}`
  );
}

async function getTemplate(userId: string) {
  const database = getDatabase();
  const [template] = await database
    .select()
    .from(repositoryDigestTemplate)
    .where(eq(repositoryDigestTemplate.userId, userId))
    .limit(1);

  if (!template) return null;

  const repositories = await database
    .select({
      fullName: repositoryDigestRepository.repositoryFullName,
      url: repositoryDigestRepository.repositoryUrl,
    })
    .from(repositoryDigestRepository)
    .where(eq(repositoryDigestRepository.templateId, template.id))
    .orderBy(asc(repositoryDigestRepository.position));

  return {
    name: template.name,
    enabled: template.enabled,
    frequency: template.frequency,
    repositories,
  };
}

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Unauthorized." }, { status: 401 });

  return Response.json({ template: await getTemplate(session.user.id) });
}

export async function PUT(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Unauthorized." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const input = body as {
    name?: unknown;
    enabled?: unknown;
    frequency?: unknown;
    repositories?: unknown;
  };
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const repositories = input.repositories;

  if (
    !name ||
    name.length > 100 ||
    typeof input.enabled !== "boolean" ||
    typeof input.frequency !== "string" ||
    !FREQUENCIES.has(input.frequency) ||
    !Array.isArray(repositories) ||
    repositories.length > MAX_REPOSITORIES ||
    !repositories.every(isRepository) ||
    new Set(repositories.map((repository) => repository.fullName.toLowerCase())).size !==
      repositories.length
  ) {
    return Response.json({ error: "Invalid repository digest template." }, { status: 400 });
  }

  const database = getDatabase();
  const validRepositories = repositories as RepositoryInput[];
  const frequency = input.frequency as "daily" | "weekly" | "fortnightly";
  const [existingRow] = await database
    .select({ id: repositoryDigestTemplate.id })
    .from(repositoryDigestTemplate)
    .where(eq(repositoryDigestTemplate.userId, session.user.id))
    .limit(1);
  const templateId = existingRow?.id ?? randomUUID();
  const existingRepositories = existingRow
    ? await database
        .select({
          fullName: repositoryDigestRepository.repositoryFullName,
          lastIssueIds: repositoryDigestRepository.lastIssueIds,
        })
        .from(repositoryDigestRepository)
        .where(eq(repositoryDigestRepository.templateId, templateId))
    : [];
  const issueIdsByRepository = new Map(
    existingRepositories.map((repository) => [
      repository.fullName.toLowerCase(),
      repository.lastIssueIds,
    ]),
  );

  await database
    .insert(repositoryDigestTemplate)
    .values({
      id: templateId,
      userId: session.user.id,
      name,
      enabled: input.enabled,
      frequency,
    })
    .onConflictDoUpdate({
      target: repositoryDigestTemplate.userId,
      set: { name, enabled: input.enabled, frequency, updatedAt: new Date() },
    });
  await database
    .delete(repositoryDigestRepository)
    .where(eq(repositoryDigestRepository.templateId, templateId));

  if (validRepositories.length) {
    await database.insert(repositoryDigestRepository).values(
      validRepositories.map((repository, position) => ({
        id: randomUUID(),
        templateId,
        repositoryFullName: repository.fullName,
        repositoryUrl: repository.url,
        position,
        lastIssueIds:
          issueIdsByRepository.get(repository.fullName.toLowerCase()) ?? "[]",
      })),
    );
  }

  return Response.json({ template: await getTemplate(session.user.id) });
}
