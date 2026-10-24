"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import DownloadCV from "./download-cv";
import { api, date, money } from "@/lib/api";
import { stageLabel, MAX_CV_BYTES } from "@/lib/hiring";
import ApplicationDialog, {
  Dialog,
  ApplicationDetails,
} from "./application-dialog";
export default function CandidateWorkspace({
  user,
  tab,
  data,
  onRefresh,
  onTab,
}: {
  user: any;
  tab: string;
  data: any;
  onRefresh: () => Promise<void>;
  onTab: (t: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [selection, setSelection] = useState<string[]>([]),
    [applying, setApplying] = useState<any[] | null>(null),
    [detail, setDetail] = useState<any>(null),
    [apps, setApps] = useState<any[]>(data.applications || []),
    [cursor, setCursor] = useState(data.nextCursor);
  useEffect(() => {
    setApps(data.applications || []);
    setCursor(data.nextCursor);
  }, [data]);
  const profile = data.profile || {},
    resumes = data.resumes || [],
    saved = data.savedJobs || [];
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function saveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void action(async () => {
      await api("/candidate/profile", {
        method: "PUT",
        body: JSON.stringify({
          ...Object.fromEntries(f),
          skills: String(f.get("skills"))
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      await onRefresh();
      setMessage("Your profile has been saved.");
    });
  }
  async function upload(file: File) {
    await action(async () => {
      if (file.size > MAX_CV_BYTES)
        throw new Error("Choose a PDF smaller than 5 MB.");
      const ticket = await api("/candidate/uploads", {
        method: "POST",
        body: JSON.stringify({ filename: file.name, size: file.size }),
      });
      if (ticket.direct) {
        const response = await fetch(ticket.url, {
          method: "PUT",
          headers: { "Content-Type": "application/pdf" },
          body: file,
        });
        if (!response.ok) throw new Error("Upload failed. Please try again.");
      } else
        await api(ticket.url.slice(4), {
          method: "PUT",
          headers: { "Content-Type": "application/pdf" },
          body: file,
        });
      await api(`/candidate/uploads/${ticket.id}/confirm`, { method: "POST" });
      await onRefresh();
      setMessage("CV uploaded privately. You can now apply to roles.");
    });
  }
  return (
    <div className="hiring-workspace">
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
      {tab === "My profile" ? (
        <div className="profile-grid">
          <section className="panel">
            <span className="eyebrow">YOUR PROFESSIONAL STORY</span>
            <h2>Make your introduction count.</h2>
            <p className="muted">
              Tell project teams what you do and when you can join.
            </p>
            <form
              key={profile._id || "new"}
              className="hiring-form"
              onSubmit={saveProfile}
            >
              <label>
                Professional headline
                <input
                  name="headline"
                  defaultValue={profile.headline}
                  required
                  minLength={3}
                  maxLength={120}
                  placeholder="Full-stack developer · Next.js & Node.js"
                />
              </label>
              <label>
                About you
                <textarea
                  name="bio"
                  defaultValue={profile.bio}
                  required
                  minLength={20}
                  maxLength={3000}
                  rows={5}
                />
              </label>
              <label>
                Skills, separated by commas
                <input
                  name="skills"
                  defaultValue={profile.skills?.join(", ")}
                  required
                  placeholder="TypeScript, MongoDB, UI design"
                />
              </label>
              <label>
                Location
                <input
                  name="location"
                  defaultValue={profile.location}
                  required
                  minLength={2}
                  maxLength={100}
                  placeholder="Lahore, Pakistan"
                />
              </label>
              <label>
                Portfolio URL (optional)
                <input
                  name="portfolioUrl"
                  type="url"
                  defaultValue={profile.portfolioUrl}
                  maxLength={500}
                  placeholder="https://…"
                />
              </label>
              <div className="hiring-two">
                <label>
                  Available from
                  <input
                    name="availableFrom"
                    type="date"
                    defaultValue={profile.availableFrom}
                  />
                </label>
                <label>
                  Available until (optional)
                  <input
                    name="availableUntil"
                    type="date"
                    defaultValue={profile.availableUntil}
                  />
                </label>
              </div>
              <button className="button" disabled={busy || !user.verified}>
                {busy ? "Saving…" : "Save profile"}
              </button>
            </form>
          </section>
          <aside className="panel cv-panel">
            <span className="eyebrow">A LITTLE MORE ABOUT YOU</span>
            <h2>Your CV, kept private.</h2>
            <p className="muted">
              Only you and the companies you apply to can download your CV. Each
              upload keeps its own version.
            </p>
            <label className="upload-box">
              {busy ? "Uploading or saving…" : "Choose a PDF CV"}
              <small>Up to 5 MB · maximum 50 pages</small>
              <input
                aria-label="Upload PDF CV"
                type="file"
                accept=".pdf,application/pdf"
                disabled={busy || !profile.headline || !user.verified}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f);
                  e.target.value = "";
                }}
              />
            </label>
            {!profile.headline && (
              <p className="muted">Save your profile to enable CV uploads.</p>
            )}
            {resumes.map((r: any) => (
              <div className="cv-version" key={r._id}>
                <a
                  href={`/api/files/resumes/${r._id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {r.filename} ↗
                </a>
                <small>
                  {date(r.createdAt)} · {Math.ceil(r.size / 1024)} KB
                  <br />
                  {r.processingStatus === "ready"
                    ? `${r.pageCount} pages · ${r.wordCount} words extracted`
                    : r.processingStatus === "failed"
                      ? "Text processing unavailable; original CV is still saved."
                      : "Text processing pending. Refresh later to see the result."}
                </small>
              </div>
            ))}
          </aside>
        </div>
      ) : tab === "Saved roles" ? (
        <>
          <div className="hiring-section-head">
            <div>
              <h2>Your shortlist</h2>
              <p className="muted">
                Select up to 10 roles and send a tailored application to each.
              </p>
            </div>
            <button
              className="button"
              disabled={!selection.length || busy}
              onClick={() =>
                setApplying(
                  saved.filter(
                    (j: any) => selection.includes(j._id) && j.available,
                  ),
                )
              }
            >
              Apply to selected ({selection.length})
            </button>
          </div>
          <div className="opportunity-grid">
            {saved.map((j: any) => (
              <article className="project-card" key={j._id}>
                <label className="select-role">
                  <input
                    type="checkbox"
                    checked={selection.includes(j._id)}
                    disabled={
                      !j.available ||
                      (!selection.includes(j._id) && selection.length >= 10)
                    }
                    onChange={(e) =>
                      setSelection(
                        e.target.checked
                          ? [...selection, j._id]
                          : selection.filter((id) => id !== j._id),
                      )
                    }
                  />
                  Select role{" "}
                  <span
                    className={`badge ${j.available ? "green" : "neutral"}`}
                  >
                    {j.available ? "Open" : "Unavailable"}
                  </span>
                </label>
                <h3>{j.title}</h3>
                <p>
                  {j.company?.name} · {j.project?.name}
                </p>
                <p>
                  {money(j.budgetMin, j.currency)} –{" "}
                  {money(j.budgetMax, j.currency)}
                </p>
                <div className="skill-tags">
                  {j.skills.map((s: string) => (
                    <span key={s}>{s}</span>
                  ))}
                </div>
                <button
                  className="text-link"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      await api(`/candidate/saved/${j._id}`, {
                        method: "DELETE",
                      });
                      setSelection(selection.filter((id) => id !== j._id));
                      await onRefresh();
                    })
                  }
                >
                  Remove from saved
                </button>
              </article>
            ))}
          </div>
          {!saved.length && <Empty text="Your shortlist is waiting." />}
        </>
      ) : tab === "Applications" ? (
        <>
          <h2>Every application, in one place.</h2>
          <p className="muted">
            Follow your progress and revisit exactly what you submitted.
          </p>
          <div className="application-list">
            {apps.map((a: any) => (
              <article className="application-card" key={a._id}>
                <div>
                  <span className="eyebrow">{a.snapshot.company.name}</span>
                  <h3>{a.snapshot.job.title}</h3>
                  <p>
                    {a.snapshot.project.name} · {date(a.createdAt)}
                  </p>
                </div>
                <span
                  className={`badge ${a.stage === "hired" ? "green" : "neutral"}`}
                >
                  {a.status === "withdrawn" ? "Withdrawn" : stageLabel(a.stage)}
                </span>
                <button
                  className="button secondary small"
                  onClick={() => setDetail(a)}
                >
                  View application
                </button>
              </article>
            ))}
          </div>
          {!apps.length && (
            <Empty text="Your next chapter starts with a project." />
          )}
          {cursor && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  const more = await api(
                    `/candidate/applications?cursor=${cursor}`,
                  );
                  setApps([...apps, ...more.applications]);
                  setCursor(more.nextCursor);
                })
              }
            >
              Load more
            </button>
          )}
        </>
      ) : (
        <>
          <section className="candidate-hero">
            <span className="eyebrow">YOUR NEXT CHAPTER</span>
            <h2>
              Good work starts with
              <br />
              the right connection.
            </h2>
            <p>
              Build your profile, find a project you believe in, and meet your
              next team.
            </p>
            <Link className="button" href="/opportunities">
              Explore open roles ↗
            </Link>
          </section>
          <div className="hiring-stats">
            {[
              ["Applications", data.stats?.total || 0],
              ["In progress", data.stats?.active || 0],
              ["Hired", data.stats?.hired || 0],
              ["Saved roles", saved.length],
            ].map(([label, n]) => (
              <article className="stat-card" key={label}>
                <span>{label}</span>
                <strong>{n}</strong>
              </article>
            ))}
          </div>
          <section className="panel">
            <h2>Your path to the next project</h2>
            <div className="readiness-step">
              <span>{profile.headline ? "✓" : "01"}</span>
              <div>
                <h3>Tell your story</h3>
                <p>Skills, experience and availability.</p>
              </div>
              <button className="text-link" onClick={() => onTab("My profile")}>
                {profile.headline ? "Edit profile" : "Create profile"} →
              </button>
            </div>
            <div className="readiness-step">
              <span>{resumes.length ? "✓" : "02"}</span>
              <div>
                <h3>Add your CV</h3>
                <p>A private PDF to support your applications.</p>
              </div>
              <button className="text-link" onClick={() => onTab("My profile")}>
                {resumes.length ? "Manage CVs" : "Upload CV"} →
              </button>
            </div>
            <div className="readiness-step">
              <span>03</span>
              <div>
                <h3>Find your people</h3>
                <p>Apply to a role or build a shortlist first.</p>
              </div>
              <Link className="text-link" href="/opportunities">
                Browse projects →
              </Link>
            </div>
          </section>
        </>
      )}
      {applying && (
        <ApplicationDialog
          jobs={applying}
          onClose={() => setApplying(null)}
          onSaved={(m) => {
            setApplying(null);
            setSelection([]);
            setMessage(m);
            void onRefresh();
            onTab("Applications");
          }}
        />
      )}
      {detail && (
        <Dialog title="Your application" onClose={() => setDetail(null)}>
          <ApplicationDetails item={detail} />
          {detail.status === "active" &&
            !["hired", "rejected"].includes(detail.stage) && (
              <form
                className="withdraw-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action(async () => {
                    await api(
                      `/candidate/applications/${detail._id}/withdraw`,
                      {
                        method: "PATCH",
                        body: JSON.stringify({ version: detail.version }),
                      },
                    );
                    setDetail(null);
                    await onRefresh();
                    setMessage("Application withdrawn.");
                  });
                }}
              >
                <label>
                  <input type="checkbox" required /> I understand I cannot
                  reapply to this role.
                </label>
                <button className="button secondary" disabled={busy}>
                  Withdraw application
                </button>
                {error && <p role="alert">{error}</p>}
              </form>
            )}
        </Dialog>
      )}
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <h3>{text}</h3>
      <Link className="button secondary" href="/opportunities">
        Explore open roles ↗
      </Link>
    </div>
  );
}
