// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const setTheme = vi.fn();

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "dark", setTheme }),
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: any) => <>{children}</>,
  TooltipTrigger: ({ children }: any) => <>{children}</>,
  TooltipContent: ({ children }: any) => <span>{children}</span>,
}));

import { ThemeToggle } from "@/components/theme-toggle";

afterEach(cleanup);

describe("ThemeToggle", () => {
  it("shows all themes, marks the active one, and switches themes", () => {
    render(<ThemeToggle />);

    expect(screen.getByRole("button", { name: "Dark theme" }).getAttribute("aria-pressed")).toBe("true");
    for (const theme of ["Light", "Dark", "System"]) {
      fireEvent.click(screen.getByRole("button", { name: `${theme} theme` }));
    }
    expect(setTheme.mock.calls.map(([theme]) => theme)).toEqual(["light", "dark", "system"]);
  });

  it("renders a stable placeholder on the server", () => {
    expect(renderToString(<ThemeToggle />)).toContain("h-9 w-[116px]");
  });
});
