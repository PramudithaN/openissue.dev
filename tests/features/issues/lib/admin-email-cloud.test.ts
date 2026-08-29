import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAdminStatus,
  sendAdminTestEmail,
} from "@/features/issues/lib/admin-email-cloud";

afterEach(() => vi.restoreAllMocks());

describe("admin email cloud client", () => {
  it("returns admin status and treats an unauthenticated response as false", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ isAdmin: true }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 401 }));

    await expect(getAdminStatus()).resolves.toBe(true);
    await expect(getAdminStatus()).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/test-email");
  });

  it("sends the selected test mode", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ sent: true }), { status: 200 }),
    );

    await sendAdminTestEmail("test@example.com", "repository");

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/test-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipientEmail: "test@example.com",
        mode: "repository",
      }),
    });
  });

  it("surfaces API and fallback errors", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Forbidden." }), { status: 403 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({}), { status: 500 }),
      )
      .mockResolvedValueOnce(
        new Response("Gateway timeout", { status: 504 }),
      );

    await expect(getAdminStatus()).rejects.toThrow("Forbidden.");
    await expect(sendAdminTestEmail("test@example.com", "combined")).rejects.toThrow(
      "Request failed.",
    );
    await expect(sendAdminTestEmail("test@example.com", "combined")).rejects.toThrow(
      "Request failed.",
    );
  });
});
