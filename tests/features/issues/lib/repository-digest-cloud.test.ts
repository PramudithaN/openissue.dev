import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getRepositoryDigestTemplate,
  saveRepositoryDigestTemplate,
  searchRepositories,
} from "@/features/issues/lib/repository-digest-cloud";

afterEach(() => vi.restoreAllMocks());

describe("repository digest cloud client", () => {
  const template = {
    name: "Alerts",
    enabled: true,
    frequency: "weekly" as const,
    repositories: [
      { fullName: "acme/repo", url: "https://github.com/acme/repo" },
    ],
  };

  it("loads and saves a template", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ template }))
      .mockResolvedValueOnce(Response.json({ template }));

    await expect(getRepositoryDigestTemplate()).resolves.toEqual(template);
    await expect(saveRepositoryDigestTemplate(template)).resolves.toEqual(template);
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/repository-digest-template",
      expect.objectContaining({ method: "PUT", body: JSON.stringify(template) }),
    );
  });

  it("searches repositories with encoded query parameters", async () => {
    const repositories = [{ fullName: "acme/repo" }];
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ repositories }));

    await expect(searchRepositories("react tools")).resolves.toEqual(repositories);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/repositories?query=react+tools",
    );
  });

  it("surfaces API error messages", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ error: "Invalid template." }, { status: 400 }),
    );
    await expect(saveRepositoryDigestTemplate(template)).rejects.toThrow(
      "Invalid template.",
    );
  });

  it("uses a fallback error when the API omits a message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({}, { status: 500 }),
    );
    await expect(getRepositoryDigestTemplate()).rejects.toThrow("Request failed.");
  });
});
