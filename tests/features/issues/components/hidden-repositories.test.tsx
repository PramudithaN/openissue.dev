// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HiddenRepositories } from "@/features/issues/components/hidden-repositories";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock;

describe("HiddenRepositories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state initially", () => {
    fetchMock.mockReturnValue(new Promise(() => {})); // Never resolves
    render(<HiddenRepositories />);
    expect(screen.getByText("Loading...")).toBeDefined();
  });

  it("renders empty state", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ repositories: [] }),
    });
    render(<HiddenRepositories />);
    await waitFor(() => {
      expect(screen.getByText("You have not hidden any repositories.")).toBeDefined();
    });
  });

  it("renders repositories and handles unhide", async () => {
    fetchMock.mockImplementation((url, init) => {
      if (url === "/api/hidden-repositories" && !init) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            repositories: [{ id: "1", repositoryFullName: "acme/repo", createdAt: "" }],
          }),
        });
      }
      if (init?.method === "DELETE") {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({ ok: false });
    });

    render(<HiddenRepositories />);
    
    await waitFor(() => {
      expect(screen.getByText("acme/repo")).toBeDefined();
    });

    const user = userEvent.setup();
    const unhideBtn = screen.getByRole("button", { name: "Unhide" });
    await user.click(unhideBtn);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/hidden-repositories?repositoryFullName=acme%2Frepo"),
      expect.objectContaining({ method: "DELETE" })
    );

    await waitFor(() => {
      expect(screen.queryByText("acme/repo")).toBeNull();
    });
  });
});
