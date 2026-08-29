// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getRepositoryDigestTemplate,
  saveRepositoryDigestTemplate,
  searchRepositories,
  updateRepositoryDigestTemplateEnabled,
} = vi.hoisted(() => ({
  getRepositoryDigestTemplate: vi.fn(),
  saveRepositoryDigestTemplate: vi.fn(),
  searchRepositories: vi.fn(),
  updateRepositoryDigestTemplateEnabled: vi.fn(),
}));
const selectControl = vi.hoisted(() => ({
  onValueChange: null as null | ((value: "daily") => void),
}));

vi.mock("@/features/issues/lib/repository-digest-cloud", () => ({
  getRepositoryDigestTemplate,
  saveRepositoryDigestTemplate,
  searchRepositories,
  updateRepositoryDigestTemplateEnabled,
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    onValueChange,
  }: {
    children: React.ReactNode;
    onValueChange: (value: "daily") => void;
  }) => {
    selectControl.onValueChange = onValueChange;
    return <div>{children}</div>;
  },
  SelectTrigger: ({ children, ...props }: React.ComponentProps<"button">) => (
    <button type="button" {...props}>{children}</button>
  ),
  SelectValue: () => <span>Weekly</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

import { RepositoryDigestCard } from "@/features/issues/components/repository-digest-card";

describe("RepositoryDigestCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRepositoryDigestTemplate.mockResolvedValue(null);
    searchRepositories.mockResolvedValue([
      {
        fullName: "acme/repo",
        url: "https://github.com/acme/repo",
        description: "Useful repository",
        stars: 100,
      },
    ]);
    saveRepositoryDigestTemplate.mockImplementation(async (template) => template);
    updateRepositoryDigestTemplateEnabled.mockImplementation(async (enabled) => enabled);
  });

  afterEach(() => cleanup());

  it("loads, autocompletes, edits, and saves a template", async () => {
    render(<RepositoryDigestCard />);
    await waitFor(() => expect(getRepositoryDigestTemplate).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText("Search GitHub repositories"), {
      target: { value: "acme" },
    });
    fireEvent.change(screen.getByLabelText("Repository alert template name"), {
      target: { value: "Custom alerts" },
    });
    act(() => selectControl.onValueChange?.("daily"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    fireEvent.click(await screen.findByText("acme/repo"));
    expect(screen.getByRole("link", { name: "acme/repo" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Disable repository alerts" }));
    fireEvent.click(screen.getByRole("button", { name: "Save template" }));
    await waitFor(() =>
      expect(saveRepositoryDigestTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: false,
          name: "Custom alerts",
          frequency: "daily",
          repositories: [
            { fullName: "acme/repo", url: "https://github.com/acme/repo" },
          ],
        }),
      ),
    );
    expect(await screen.findByText("Repository alert template saved.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remove acme/repo" }));
    expect(screen.queryByRole("link", { name: "acme/repo" })).toBeNull();
  });

  it("restores a saved template and reports load failures", async () => {
    getRepositoryDigestTemplate.mockResolvedValueOnce({
      name: "Daily alerts",
      enabled: true,
      frequency: "daily",
      repositories: [],
    });
    const { unmount } = render(<RepositoryDigestCard />);
    expect(await screen.findByDisplayValue("Daily alerts")).toBeTruthy();
    unmount();

    getRepositoryDigestTemplate.mockRejectedValueOnce(new Error("offline"));
    render(<RepositoryDigestCard />);
    expect(await screen.findByText("Unable to load repository alerts.")).toBeTruthy();
  });

  it("reports save failures", async () => {
    saveRepositoryDigestTemplate.mockRejectedValue(new Error("Save failed."));
    render(<RepositoryDigestCard />);
    fireEvent.click(screen.getByRole("button", { name: "Save template" }));
    expect(await screen.findByText("Save failed.")).toBeTruthy();
  });

  it("persists disabling an existing template without saving other edits", async () => {
    getRepositoryDigestTemplate.mockResolvedValueOnce({
      name: "Saved alerts",
      enabled: true,
      frequency: "weekly",
      repositories: [],
    });
    render(<RepositoryDigestCard />);
    expect(await screen.findByDisplayValue("Saved alerts")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Repository alert template name"), {
      target: { value: "" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Disable repository alerts" }));

    await waitFor(() =>
      expect(updateRepositoryDigestTemplateEnabled).toHaveBeenCalledWith(false),
    );
    expect(saveRepositoryDigestTemplate).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Repository alert template name")).toHaveProperty(
      "value",
      "",
    );
    expect(await screen.findByText("Repository alerts disabled.")).toBeTruthy();
  });

  it("waits for the template lookup before allowing alerts to toggle", async () => {
    let resolveTemplate: ((value: null) => void) | undefined;
    getRepositoryDigestTemplate.mockReturnValueOnce(
      new Promise<null>((resolve) => {
        resolveTemplate = resolve;
      }),
    );
    render(<RepositoryDigestCard />);

    expect(screen.getByRole("button", { name: "Disable repository alerts" })).toHaveProperty(
      "disabled",
      true,
    );

    await act(async () => resolveTemplate?.(null));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Disable repository alerts" }),
      ).toHaveProperty("disabled", false),
    );
  });

  it("preserves draft edits when persisting a toggle fails", async () => {
    getRepositoryDigestTemplate.mockResolvedValueOnce({
      name: "Saved alerts",
      enabled: true,
      frequency: "weekly",
      repositories: [],
    });
    let rejectUpdate: ((reason: Error) => void) | undefined;
    updateRepositoryDigestTemplateEnabled.mockReturnValueOnce(
      new Promise<boolean>((_resolve, reject) => {
        rejectUpdate = reject;
      }),
    );
    render(<RepositoryDigestCard />);
    expect(await screen.findByDisplayValue("Saved alerts")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Disable repository alerts" }));
    fireEvent.change(screen.getByLabelText("Repository alert template name"), {
      target: { value: "Draft name" },
    });
    await act(async () => rejectUpdate?.(new Error("Save failed.")));

    expect(await screen.findByText("Save failed.")).toBeTruthy();
    expect(screen.getByDisplayValue("Draft name")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Disable repository alerts" })).toBeTruthy();
  });

  it("handles repository search failures", async () => {
    searchRepositories.mockRejectedValueOnce(new Error("offline"));
    render(<RepositoryDigestCard />);
    fireEvent.change(screen.getByLabelText("Search GitHub repositories"), {
      target: { value: "missing" },
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(searchRepositories).toHaveBeenCalledWith("missing");
    expect(screen.queryByText("acme/repo")).toBeNull();
  });

  it("enforces the five-repository limit", async () => {
    const repositories = Array.from({ length: 5 }, (_, index) => ({
      fullName: `acme/repo-${index}`,
      url: `https://github.com/acme/repo-${index}`,
    }));
    getRepositoryDigestTemplate.mockResolvedValueOnce({
      name: "Full",
      enabled: true,
      frequency: "weekly",
      repositories,
    });
    render(<RepositoryDigestCard />);
    const search = await screen.findByLabelText("Search GitHub repositories");
    await waitFor(() => expect(search).toHaveProperty("disabled", true));
  });
});
