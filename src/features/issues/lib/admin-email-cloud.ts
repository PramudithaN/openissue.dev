async function jsonResponse<T>(response: Response): Promise<T> {
  const responseText = await response.text();
  let payload = {} as T & { error?: string };
  if (responseText) {
    try {
      payload = JSON.parse(responseText) as T & { error?: string };
    } catch {
      // Gateways can return plain text or an empty body for function failures.
    }
  }
  if (!response.ok) throw new Error(payload.error ?? "Request failed.");
  return payload;
}

export async function getAdminStatus() {
  const response = await fetch("/api/admin/test-email");
  if (response.status === 401) return false;
  return (await jsonResponse<{ isAdmin: boolean }>(response)).isAdmin;
}

export type AdminTestEmailMode = "saved-search" | "repository" | "combined";

export async function sendAdminTestEmail(
  recipientEmail: string,
  mode: AdminTestEmailMode,
) {
  await jsonResponse<{ sent: true }>(
    await fetch("/api/admin/test-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipientEmail, mode }),
    }),
  );
}
