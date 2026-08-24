import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isRepositoryAlertDue } from "@/features/issues/server/digest-delivery";

describe("repository alert schedule", () => {
  const now = new Date("2026-08-24T09:00:00.000Z");

  it("sends templates that have never been delivered", () => {
    expect(isRepositoryAlertDue("daily", null, now)).toBe(true);
  });

  it.each([
    ["daily", "2026-08-23T13:00:00.000Z", true],
    ["daily", "2026-08-23T14:00:01.000Z", false],
    ["weekly", "2026-08-17T13:00:00.000Z", true],
    ["weekly", "2026-08-17T13:00:01.000Z", false],
    ["fortnightly", "2026-08-10T13:00:00.000Z", true],
    ["fortnightly", "2026-08-10T13:00:01.000Z", false],
  ] as const)("evaluates %s delivery windows", (frequency, lastSentAt, due) => {
    expect(isRepositoryAlertDue(frequency, new Date(lastSentAt), now)).toBe(due);
  });
});
