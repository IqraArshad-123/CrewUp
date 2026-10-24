"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Brand } from "./brand";
export default function AcceptInvitation() {
  const [token, setToken] = useState(""),
    [error, setError] = useState(""),
    [done, setDone] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    setToken(new URLSearchParams(location.search).get("token") || "");
  }, []);
  return (
    <main className="recovery-page">
      <Brand />
      <section className="panel">
        <h1>Join your hiring team.</h1>
        <p>
          Sign in with the invited email address. New here? Register as a
          recruiter and verify your email first, then return to this invitation
          link.
        </p>
        <div className="row-actions">
          <Link href="/login">Sign in</Link>
          <Link href="/register">Create account</Link>
        </div>
        {error && <p className="alert error">{error}</p>}
        {done ? (
          <>
            <p className="alert success">Invitation accepted.</p>
            <Link className="button" href="/dashboard">
              Open your workspace
            </Link>
          </>
        ) : (
          <button
            className="button"
            disabled={busy || !token}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await api("/team/accept", {
                  method: "POST",
                  body: JSON.stringify({ token }),
                });
                setDone(true);
                history.replaceState(null, "", "/accept-invitation");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Accept invitation
          </button>
        )}
      </section>
    </main>
  );
}
