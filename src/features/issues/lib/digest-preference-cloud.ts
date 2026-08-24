export async function getDigestPreference(): Promise<boolean> {
  const response = await fetch("/api/digest-preference");

  if (!response.ok) {
    throw new Error("Unable to load the weekly digest preference.");
  }

  const result = (await response.json()) as { enabled: boolean };
  return result.enabled;
}

export async function getAlertEmail(): Promise<string> {
  const response = await fetch("/api/digest-preference");
  if (!response.ok) throw new Error("Unable to load the alert email.");
  const result = (await response.json()) as { alertEmail: string | null };
  return result.alertEmail ?? "";
}

export async function updateAlertEmail(alertEmail: string): Promise<string> {
  const response = await fetch("/api/digest-preference", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ alertEmail }),
  });
  const result = (await response.json()) as {
    alertEmail?: string | null;
    error?: string;
  };
  if (!response.ok) throw new Error(result.error ?? "Unable to update the alert email.");
  return result.alertEmail ?? "";
}

export async function updateDigestPreference(enabled: boolean): Promise<boolean> {
  const response = await fetch("/api/digest-preference", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });

  if (!response.ok) {
    throw new Error("Unable to update the weekly digest preference.");
  }

  const result = (await response.json()) as { enabled: boolean };
  return result.enabled;
}

export async function triggerWeeklyDigest(): Promise<void> {
  const response = await fetch("/api/digest-trigger", { method: "POST" });

  if (!response.ok) {
    const result = (await response.json()) as { error?: string };
    throw new Error(result.error ?? "Unable to send the weekly digest.");
  }
}
