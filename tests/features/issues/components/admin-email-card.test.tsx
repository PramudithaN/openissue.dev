// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getAdminStatus, sendAdminTestEmail } = vi.hoisted(() => ({
  getAdminStatus: vi.fn(),
  sendAdminTestEmail: vi.fn(),
}));

vi.mock("@/features/issues/lib/admin-email-cloud", () => ({
  getAdminStatus,
  sendAdminTestEmail,
}));

import { AdminEmailCard } from "@/features/issues/components/admin-email-card";

describe("AdminEmailCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAdminStatus.mockResolvedValue(true);
    sendAdminTestEmail.mockResolvedValue(undefined);
  });

  afterEach(() => cleanup());

  it("stays hidden for non-admin users", async () => {
    getAdminStatus.mockResolvedValue(false);
    render(<AdminEmailCard defaultEmail="user@example.com" />);
    await waitFor(() => expect(getAdminStatus).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Admin email" })).toBeNull();
  });

  it("opens the admin tab and sends a combined test email", async () => {
    render(<AdminEmailCard defaultEmail="admin@example.com" />);
    fireEvent.click(await screen.findByRole("button", { name: "Admin email" }));
    fireEvent.change(screen.getByLabelText("Test alert recipient"), {
      target: { value: "test@example.com" },
    });
    expect(screen.getByRole("button", { name: "Saved searches" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Repository alerts" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Both" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Repository alerts" }));
    fireEvent.click(screen.getByRole("button", { name: "Send test email" }));

    await waitFor(() =>
      expect(sendAdminTestEmail).toHaveBeenCalledWith(
        "test@example.com",
        "repository",
      ),
    );
    expect(
      await screen.findByText("Repository alerts test alert sent to test@example.com."),
    ).toBeTruthy();
  });

  it("reports test-send failures", async () => {
    sendAdminTestEmail.mockRejectedValueOnce(new Error("SMTP unavailable."));
    render(<AdminEmailCard defaultEmail="admin@example.com" />);
    fireEvent.click(await screen.findByRole("button", { name: "Admin email" }));
    fireEvent.click(screen.getByRole("button", { name: "Send test email" }));
    expect(await screen.findByText("SMTP unavailable.")).toBeTruthy();
  });
});
