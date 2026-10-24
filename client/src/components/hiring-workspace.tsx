"use client";
import { useState, useEffect, useCallback } from "react";
import { api, date } from "@/lib/api";
import { stages, stageLabel, nextStages } from "@/lib/hiring";
import { ScheduleInterview } from "./interview-workspace";
import { Dialog, ApplicationDetails } from "./application-dialog";
export default function HiringWorkspace({ tab }: { tab: string }) {
  const [scheduling, setScheduling] = useState<any>(null);
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [stage, setStage] = useState(""),
    [job, setJob] = useState(""),
    [detail, setDetail] = useState<any>(null),
    [message, setMessage] = useState("");
  const load = useCallback(
    async (cursor?: string) => {
      const q = new URLSearchParams();
      if (stage) q.set("stage", stage);
      if (job) q.set("jobId", job);
      if (cursor) q.set("cursor", cursor);
      const result = await api(`/hiring?${q}`);
      setData((old: any) =>
        cursor
          ? {
              ...result,
              applications: [...old.applications, ...result.applications],
            }
          : result,
      );
      return result;
    },
    [stage, job],
  );
  useEffect(() => {
    setError("");
    void load().catch((e) => setError(e.message));
  }, [load]);
  async function update(kind: string, body: any) {
    setBusy(true);
    setError("");
    try {
      await api(`/hiring/applications/${detail._id}/${kind}`, {
        method: "PATCH",
        body: JSON.stringify({ ...body, version: detail.version }),
      });
      setDetail(null);
      await load();
      setMessage(
        kind === "notes"
          ? "Private notes saved."
          : "Application stage updated.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
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
      {!data && !error && <p>Loading applications…</p>}
      {data &&
        (tab === "Team readiness" ? (
          <>
            <span className="eyebrow">FROM OPEN ROLES TO A COMPLETE TEAM</span>
            <h2>See where your team stands.</h2>
            <p className="muted">
              A role is covered when at least one candidate is marked hired.
              This tracks role coverage, not project delivery or headcount
              targets.
            </p>
            {data.projects.map((p: any) => {
              const roles = data.jobs.filter((j: any) => j.projectId === p._id),
                covered = roles.filter((j: any) =>
                  data.coverage.some((c: any) => c._id === j._id),
                ).length;
              return (
                <section className="panel readiness-project" key={p._id}>
                  <div className="hiring-section-head">
                    <h3>{p.name}</h3>
                    <span className="badge green">
                      {covered} / {roles.length} roles covered
                    </span>
                  </div>
                  <progress
                    aria-label={`${p.name} role coverage`}
                    max={roles.length || 1}
                    value={covered}
                  />
                  {!roles.length && (
                    <p className="muted">
                      Add roles to begin building this team.
                    </p>
                  )}
                  {roles.map((j: any) => {
                    const count =
                      data.coverage.find((c: any) => c._id === j._id)?.hires ||
                      0;
                    return (
                      <div className="readiness-step" key={j._id}>
                        <span>{count ? "✓" : "○"}</span>
                        <div>
                          <h3>{j.title}</h3>
                          <p>
                            {count
                              ? `${count} hired`
                              : j.status === "open"
                                ? "Accepting applications"
                                : `Role ${j.status}`}
                          </p>
                          {count > 0 && (
                            <small className="muted">
                              {data.coverage.find((c: any) => c._id === j._id)
                                ?.dateCoverage || 0}{" "}
                              of {count} hires declare availability covering all
                              current project dates. Missing dates need
                              confirmation.
                            </small>
                          )}
                        </div>
                        <span
                          className={`badge ${count ? "green" : "neutral"}`}
                        >
                          {count ? "Covered" : "Not covered"}
                        </span>
                      </div>
                    );
                  })}
                </section>
              );
            })}
            {!data.projects.length && (
              <div className="empty-state">
                Create your first project to see team readiness.
              </div>
            )}
          </>
        ) : (
          <>
            <div className="hiring-stats">
              {["applied", "screening", "interview", "hired"].map((s) => (
                <article className="stat-card" key={s}>
                  <span>{stageLabel(s)}</span>
                  <strong>{data.stats[s] || 0}</strong>
                </article>
              ))}
            </div>
            <div className="hiring-section-head">
              <div>
                <h2>Find the people behind the profiles.</h2>
                <p className="muted">
                  Review applications, leave private notes and move candidates
                  forward.
                </p>
              </div>
            </div>
            <div className="hiring-filters">
              <label>
                Role
                <select value={job} onChange={(e) => setJob(e.target.value)}>
                  <option value="">All roles</option>
                  {data.jobs.map((j: any) => (
                    <option key={j._id} value={j._id}>
                      {j.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Stage
                <select
                  value={stage}
                  onChange={(e) => setStage(e.target.value)}
                >
                  <option value="">All stages</option>
                  {stages.map((s) => (
                    <option key={s} value={s}>
                      {stageLabel(s)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="application-list">
              {data.applications.map((a: any) => (
                <article className="application-card" key={a._id}>
                  <div>
                    <span className="eyebrow">{a.snapshot.job.title}</span>
                    <h3>{a.snapshot.candidate.name}</h3>
                    <p>{a.snapshot.candidate.headline}</p>
                    <small className="muted">
                      {date(a.createdAt)} · {a.snapshot.project.name}
                    </small>
                  </div>
                  <span
                    className={`badge ${a.stage === "hired" ? "green" : "neutral"}`}
                  >
                    {a.status === "withdrawn"
                      ? "Withdrawn"
                      : stageLabel(a.stage)}
                  </span>
                  <button
                    className="button secondary small"
                    onClick={() => {
                      setError("");
                      setDetail(a);
                    }}
                  >
                    Review application
                  </button>
                </article>
              ))}
            </div>
            {!data.applications.length && (
              <div className="empty-state">
                <h3>No applications here yet.</h3>
                <p>Applications to your published roles will appear here.</p>
              </div>
            )}
            {data.nextCursor && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void load(data.nextCursor)
                    .catch((e) => setError(e.message))
                    .finally(() => setBusy(false));
                }}
              >
                Load more
              </button>
            )}
          </>
        ))}
      {scheduling && (
        <ScheduleInterview
          application={scheduling}
          onClose={() => setScheduling(null)}
          onSaved={() => {
            setScheduling(null);
            setMessage("Interview scheduled. Open Interviews to manage it.");
            void load().catch((e) => setError(e.message));
          }}
        />
      )}
      {detail && (
        <Dialog
          title="Review application"
          onClose={() => !busy && setDetail(null)}
        >
          {error && (
            <div className="alert error" role="alert">
              {error}
              <button
                className="text-link"
                onClick={() => {
                  setDetail(null);
                  void load().catch((e) => setError(e.message));
                }}
              >
                Refresh applications
              </button>
            </div>
          )}
          {data.canManage &&
            detail.status === "active" &&
            ["applied", "screening", "interview", "final_interview"].includes(
              detail.stage,
            ) && (
              <button
                className="button"
                onClick={() => {
                  setScheduling(detail);
                  setDetail(null);
                }}
              >
                Schedule interview
              </button>
            )}
          <ApplicationDetails item={detail} />
          {data.canManage ? (
            <>
              <form
                className="hiring-form application-section"
                onSubmit={(e) => {
                  e.preventDefault();
                  void update("notes", {
                    notes: new FormData(e.currentTarget).get("notes"),
                  });
                }}
              >
                <label>
                  Private team notes
                  <textarea
                    name="notes"
                    defaultValue={detail.notes || ""}
                    maxLength={4000}
                    rows={3}
                  />
                </label>
                <p className="muted">
                  Visible to your company’s reviewers only.
                </p>
                <button className="button secondary" disabled={busy}>
                  Save notes
                </button>
              </form>
              {detail.status === "active" &&
              nextStages(detail.stage).length > 0 ? (
                <form
                  className="hiring-form application-section"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void update("stage", {
                      stage: new FormData(e.currentTarget).get("stage"),
                    });
                  }}
                >
                  <label>
                    Move application forward
                    <select name="stage" required defaultValue="">
                      <option value="" disabled>
                        Choose next stage
                      </option>
                      {nextStages(detail.stage).map((s) => (
                        <option key={s} value={s}>
                          {stageLabel(s)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="check-label">
                    <input type="checkbox" required /> I have reviewed this
                    decision. Stage changes cannot be reversed. Any scheduled
                    interview will be cancelled.
                  </label>
                  <button className="button" disabled={busy}>
                    Update stage
                  </button>
                </form>
              ) : (
                <p className="quiet-note">
                  This application is{" "}
                  {detail.status === "withdrawn"
                    ? "withdrawn"
                    : stageLabel(detail.stage).toLowerCase()}{" "}
                  and cannot move to another stage.
                </p>
              )}
            </>
          ) : (
            <p className="quiet-note">
              Your workspace role has read-only access to applications.
            </p>
          )}
        </Dialog>
      )}
    </div>
  );
}
