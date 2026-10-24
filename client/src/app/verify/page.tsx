"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Brand } from "@/components/brand";
export default function Verify() {
  const [message, setMessage] = useState(
    "Confirm your email to unlock your CrewUp workspace.",
  );
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <main className="verify-page">
      <Brand />
      <div className="panel">
        <h1>Verify your email.</h1>
        <p role="status">{message}</p>
        {!done ? (
          <button
            className="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await api("/auth/verify", {
                  method: "POST",
                  body: JSON.stringify({
                    token:
                      new URLSearchParams(location.search).get("token") || "",
                  }),
                });
                setMessage(r.message);
                setDone(true);
              } catch (e) {
                setMessage((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Verifying…" : "Verify email"}
          </button>
        ) : (
          <Link className="button" href="/dashboard">
            Go to workspace →
          </Link>
        )}
      </div>
    </main>
  );
}
