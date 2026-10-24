"use client";
import { useState } from "react";
import Link from "next/link";
import { Brand } from "./brand";
import { api } from "@/lib/api";
export default function PasswordRecovery({
  reset = false,
  local = false,
}: {
  reset?: boolean;
  local?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [done, setDone] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (reset && f.get("password") !== f.get("confirm"))
        throw new Error("The passwords do not match.");
      const result = await api(
        reset ? "/auth/reset-password" : "/auth/forgot-password",
        {
          method: "POST",
          body: JSON.stringify(
            reset
              ? {
                  token:
                    new URLSearchParams(window.location.search).get("token") ||
                    "",
                  password: f.get("password"),
                }
              : { email: f.get("email") },
          ),
        },
      );
      setMessage(result.message);
      setDone(true);
      if (reset) {
        localStorage.setItem("crewup-session-change", String(Date.now()));
        window.history.replaceState({}, "", window.location.pathname);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="verify-page">
      <Brand />
      <section className="panel recovery-panel">
        <span className="eyebrow">A FRESH START</span>
        <h1>{reset ? "Choose a new password." : "Forgot your password?"}</h1>
        <p className="muted">
          {reset
            ? "Use at least 10 characters. Updating your password signs out all existing sessions."
            : "Enter your account email and we’ll send a link that expires in 30 minutes."}
        </p>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {message && (
          <div className="alert success" role="status">
            {message}
          </div>
        )}
        {!done && (
          <form className="hiring-form" onSubmit={submit}>
            {reset ? (
              <>
                <label>
                  New password
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={10}
                    maxLength={72}
                    autoComplete="new-password"
                  />
                </label>
                <label>
                  Confirm new password
                  <input
                    name="confirm"
                    type="password"
                    required
                    minLength={10}
                    maxLength={72}
                    autoComplete="new-password"
                  />
                </label>
              </>
            ) : (
              <label>
                Email address
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                />
              </label>
            )}
            <button className="button" disabled={busy}>
              {busy
                ? "Please wait…"
                : reset
                  ? "Reset password"
                  : "Send reset link"}
            </button>
          </form>
        )}
        {local && !reset && (
          <p className="quiet-note">
            Local demo: emails are saved privately on this computer. Ask the
            developer to open your reset message; no real email is sent.
          </p>
        )}
        <p>
          <Link className="text-link" href="/login">
            Back to sign in →
          </Link>
        </p>
      </section>
    </main>
  );
}
