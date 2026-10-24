"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Layers, Check, Eye, EyeOff } from "lucide-react";
import { Brand } from "./brand";
import { api } from "@/lib/api";
export default function AuthForm({
  register = false,
  dev = false,
}: {
  register?: boolean;
  dev?: boolean;
}) {
  const router = useRouter();
  const [role, setRole] = useState("recruiter");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("role") === "applicant")
      setRole("applicant");
  }, []);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      await api(register ? "/auth/register" : "/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
          ...(register ? { name: form.get("name"), role } : {}),
        }),
      });
      localStorage.setItem("crewup-session-change", String(Date.now()));
      router.push("/dashboard");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function demo(kind: string) {
    setBusy(true);
    setError("");
    try {
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: `${kind}@crewup.demo`,
          password: "CrewUpDemo!2026",
        }),
      });
      localStorage.setItem("crewup-session-change", String(Date.now()));
      router.push("/dashboard");
    } catch {
      setError("Demo accounts are not seeded yet. Run npm run seed first.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-layout">
      <section className="auth-aside">
        <Brand light />
        <div>
          <span className="eyebrow">GOOD WORK STARTS WITH GOOD PEOPLE.</span>
          <h1>
            One project.
            <br />
            Many talents.
            <br />
            <em>Endless possibility.</em>
          </h1>
          <p>
            A thoughtful home for your ideas, your roles, and the people who
            bring them to life.
          </p>
          <div className="auth-note">
            <Layers size={27} />
            <span>
              Bring your next team
              <br />
              <b>together on CrewUp.</b>
            </span>
          </div>
        </div>
        <small>Clear goals. Connected teams.</small>
      </section>
      <section className="auth-main">
        <Link className="text-link back-home" href="/">
          ← Back to home
        </Link>
        <div className="auth-card">
          <span className="eyebrow">
            {register
              ? "MAKE ROOM FOR YOUR NEXT CHAPTER"
              : "YOUR WORKSPACE IS WAITING"}
          </span>
          <h2>{register ? "Let’s build something." : "Welcome back."}</h2>
          <p className="muted">
            {register
              ? "Create your account and find your people."
              : "Sign in to pick up where you left off."}
          </p>
          {register && (
            <div className="role-choice">
              <button
                onClick={() => setRole("recruiter")}
                className={role === "recruiter" ? "selected" : ""}
              >
                <b>I’m building a team</b>
                <span>Post projects and hire people</span>
                {role === "recruiter" && <Check size={16} />}
              </button>
              <button
                onClick={() => setRole("applicant")}
                className={role === "applicant" ? "selected" : ""}
              >
                <b>I’m looking for work</b>
                <span>Discover projects and roles</span>
                {role === "applicant" && <Check size={16} />}
              </button>
            </div>
          )}
          <form onSubmit={submit}>
            {register && (
              <label>
                Full name
                <input
                  name="name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={80}
                  placeholder="Your full name"
                />
              </label>
            )}
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@company.com"
              />
            </label>
            <label>
              Password
              <div className="password-field">
                <input
                  name="password"
                  type={show ? "text" : "password"}
                  required
                  minLength={register ? 10 : 1}
                  maxLength={72}
                  autoComplete={register ? "new-password" : "current-password"}
                  placeholder={
                    register ? "At least 10 characters" : "Enter your password"
                  }
                />
                <button
                  type="button"
                  aria-label={show ? "Hide password" : "Show password"}
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}
            <button className="button full" disabled={busy}>
              {busy ? "Please wait…" : register ? "Create account" : "Sign in"}
              <ArrowRight size={18} />
            </button>
          </form>
          {!register && (
            <p>
              <Link href="/forgot-password" className="text-link">
                Forgot your password?
              </Link>
            </p>
          )}
          <p className="auth-switch">
            {register ? "Already have an account?" : "New to CrewUp?"}{" "}
            <Link href={register ? "/login" : "/register"}>
              {register ? "Sign in" : "Create an account"}
            </Link>
          </p>
          {dev && !register && (
            <div className="demo-login">
              <span>LOCAL DEMO · SAMPLE DATA</span>
              <div>
                {["recruiter", "applicant", "admin"].map((r) => (
                  <button key={r} disabled={busy} onClick={() => demo(r)}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
