"use client";

import { useEffect, useState } from "react";
import { Mail, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  getAdminStatus,
  sendAdminTestEmail,
  type AdminTestEmailMode,
} from "@/features/issues/lib/admin-email-cloud";

const EMAIL_MODES: Array<{ value: AdminTestEmailMode; label: string }> = [
  { value: "saved-search", label: "Saved searches" },
  { value: "repository", label: "Repository alerts" },
  { value: "combined", label: "Both" },
];

export function AdminEmailCard({ defaultEmail }: Readonly<{ defaultEmail: string }>) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState(defaultEmail);
  const [mode, setMode] = useState<AdminTestEmailMode>("combined");
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getAdminStatus()
      .then((status) => {
        if (!cancelled) setIsAdmin(status);
      })
      .catch(() => {
        // Admin controls remain hidden when authorization cannot be checked.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isAdmin) return null;

  async function sendTestEmail() {
    setIsSending(true);
    setMessage(null);
    try {
      await sendAdminTestEmail(recipientEmail, mode);
      const modeLabel = EMAIL_MODES.find((option) => option.value === mode)?.label;
      setMessage(`${modeLabel} test alert sent to ${recipientEmail.trim()}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to send test email.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant={isOpen ? "default" : "outline"}
        size="sm"
        className="w-full gap-2"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <Shield className="h-4 w-4" />
        Admin email
      </Button>
      {isOpen ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Send test alert</CardTitle>
            <CardDescription>
              Send a saved-search, repository-alert, or combined preview without
              changing delivery timestamps.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              type="email"
              value={recipientEmail}
              onChange={(event) => setRecipientEmail(event.target.value)}
              aria-label="Test alert recipient"
              placeholder="recipient@example.com"
            />
            <div className="grid grid-cols-3 gap-1" aria-label="Test alert type">
              {EMAIL_MODES.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={mode === option.value ? "default" : "outline"}
                  size="sm"
                  className="h-auto min-w-0 whitespace-normal px-1 py-1 text-center leading-tight"
                  onClick={() => setMode(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <Button
              type="button"
              className="w-full gap-2"
              disabled={isSending || !recipientEmail.trim()}
              onClick={() => void sendTestEmail()}
            >
              <Mail className="h-4 w-4" />
              {isSending ? "Sending..." : "Send test email"}
            </Button>
            {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
