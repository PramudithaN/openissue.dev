import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getDigestPreference,
  getAlertEmail,
  triggerWeeklyDigest,
  updateDigestPreference,
  updateAlertEmail,
} from "@/features/issues/lib/digest-preference-cloud";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("digest preference cloud client", () => {
  it("loads and updates the preference", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ enabled: true }))
      .mockResolvedValueOnce(Response.json({ enabled: false }));

    await expect(getDigestPreference()).resolves.toBe(true);
    await expect(updateDigestPreference(false)).resolves.toBe(false);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/digest-preference", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
  });

  it("loads and updates the alternate alert email", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ alertEmail: "alerts@example.com" }))
      .mockResolvedValueOnce(Response.json({ alertEmail: "next@example.com" }));

    await expect(getAlertEmail()).resolves.toBe("alerts@example.com");
    await expect(updateAlertEmail("next@example.com")).resolves.toBe(
      "next@example.com",
    );
    expect(fetchMock).toHaveBeenLastCalledWith("/api/digest-preference", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alertEmail: "next@example.com" }),
    });
  });

  it("reports request failures", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 500 }),
    );

    await expect(getDigestPreference()).rejects.toThrow("Unable to load");
    await expect(updateDigestPreference(true)).rejects.toThrow("Unable to update");
  });

  it("reports alternate-email API failures", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ error: "Email rejected." }, { status: 400 }),
    );
    await expect(updateAlertEmail("bad@example.com")).rejects.toThrow(
      "Email rejected.",
    );
  });

  it("uses the alternate-email fallback error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({}, { status: 500 }),
    );
    await expect(updateAlertEmail("alerts@example.com")).rejects.toThrow(
      "Unable to update the alert email.",
    );
  });

  it("triggers a manual digest", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ sent: true }));

    await triggerWeeklyDigest();

    expect(fetchMock).toHaveBeenCalledWith("/api/digest-trigger", {
      method: "POST",
    });
  });

  it.each([
    [{ error: "Digest unavailable." }, "Digest unavailable."],
    [{}, "Unable to send the weekly digest."],
  ])("reports manual digest errors", async (payload, message) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(payload, { status: 502 }),
    );
    await expect(triggerWeeklyDigest()).rejects.toThrow(message);
  });
});
