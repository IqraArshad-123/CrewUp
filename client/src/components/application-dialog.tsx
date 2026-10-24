"use client";
import { useEffect, useRef, useState, useId } from "react";
import Link from "next/link";
import DownloadCV from "./download-cv";
import { api, date } from "@/lib/api";
export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="editor-dialog hiring-dialog"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="hiring-dialog-head">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
export default function ApplicationDialog({
  jobs,
  onClose,
  onSaved,
}: {
  jobs: any[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api("/candidate")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const result = await api("/candidate/applications", {
        method: "POST",
        body: JSON.stringify({
          resumeId: f.get("resumeId"),
          entries: jobs.map((j) => ({
            jobId: j._id,
            jobUpdatedAt: j.updatedAt,
            coverLetter: f.get(`letter-${j._id}`),
            answers: (j.screeningQuestions || []).map((q: any) => ({
              questionId: q.id,
              answer: f.get(`${j._id}-${q.id}`) || "",
            })),
          })),
        }),
      });
      onSaved(result.message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      title={
        jobs.length > 1
          ? `Apply to ${jobs.length} roles`
          : `Apply for ${jobs[0]?.title}`
      }
      onClose={() => !busy && onClose()}
    >
      <p className="muted">
        Your profile, selected CV and these role details are saved with your
        application. Later edits will not change that copy.
      </p>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {!data && !error && <p>Loading your profile…</p>}
      {data && (!data.profile?.headline || !data.resumes?.length) ? (
        <div className="quiet-note">
          Add your profile and a PDF CV before applying.{" "}
          <Link href="/dashboard?tab=My%20profile">Complete my profile →</Link>
        </div>
      ) : (
        data && (
          <form className="hiring-form" onSubmit={submit}>
            <label>
              Choose your CV
              <select name="resumeId" required>
                {data.resumes.map((r: any) => (
                  <option key={r._id} value={r._id}>
                    {r.filename} · {date(r.createdAt)}
                  </option>
                ))}
              </select>
            </label>
            {jobs.map((j) => (
              <section className="application-section" key={j._id}>
                <span className="eyebrow">{j.company?.name}</span>
                <h3>{j.title}</h3>
                <p className="muted">
                  {j.project?.name} · {j.project?.workMode}
                </p>
                {((data.profile.availableFrom &&
                  j.project?.startDate &&
                  data.profile.availableFrom >
                    j.project.startDate.slice(0, 10)) ||
                  (data.profile.availableUntil &&
                    j.project?.endDate &&
                    data.profile.availableUntil <
                      j.project.endDate.slice(0, 10))) && (
                  <div className="quiet-note">
                    Your availability does not cover the full project dates.
                    Explain the dates you can commit to below.
                  </div>
                )}
                <label>
                  Why are you a good fit?
                  <textarea
                    name={`letter-${j._id}`}
                    required
                    minLength={20}
                    maxLength={3000}
                    rows={4}
                    placeholder="Introduce yourself and explain how you can help this project."
                  />
                </label>
                {(j.screeningQuestions || []).map((q: any) => (
                  <label key={q.id}>
                    {q.text}
                    {q.required ? " *" : " (optional)"}
                    <textarea
                      name={`${j._id}-${q.id}`}
                      required={q.required}
                      maxLength={2000}
                      rows={2}
                    />
                  </label>
                ))}
              </section>
            ))}
            <div className="hiring-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={onClose}
              >
                Cancel
              </button>
              <button className="button" disabled={busy}>
                {busy
                  ? "Submitting…"
                  : "Submit application" + (jobs.length > 1 ? "s" : "")}
              </button>
            </div>
          </form>
        )
      )}
    </Dialog>
  );
}
export function ApplicationDetails({ item }: { item: any }) {
  const s = item.snapshot;
  return (
    <>
      <span className="eyebrow">
        {s.company.name} · {s.project.name}
      </span>
      <h3>{s.job.title}</h3>
      <p className="muted">
        Submitted {date(item.createdAt)} · {s.project.workMode}
      </p>
      <h3>Profile at submission</h3>
      <p>
        <b>{s.candidate.name}</b> · {s.candidate.headline}
      </p>
      <p>
        {s.candidate.email} · {s.candidate.location}
      </p>
      <p className="preserve-lines">{s.candidate.bio}</p>
      <div className="skill-tags">
        {s.candidate.skills.map((s: string) => (
          <span key={s}>{s}</span>
        ))}
      </div>
      {s.candidate.portfolioUrl && (
        <p>
          <a href={s.candidate.portfolioUrl} target="_blank" rel="noreferrer">
            View portfolio ↗
          </a>
        </p>
      )}
      <p className="muted">
        Available: {s.candidate.availableFrom || "Not specified"} –{" "}
        {s.candidate.availableUntil || "Open ended"}
      </p>
      <DownloadCV id={item.resumeId} filename={s.resume.filename} />
      <h3>Cover letter</h3>
      <p className="preserve-lines">{item.coverLetter}</p>
      {item.answers?.map((a: any) => (
        <div key={a.questionId}>
          <b>{a.question}</b>
          <p className="preserve-lines">{a.answer || "No answer provided"}</p>
        </div>
      ))}
      <h3>Application timeline</h3>
      <ol className="application-timeline">
        {item.history.map((h: any, i: number) => (
          <li key={i}>
            <b>{h.stage.replaceAll("_", " ")}</b>
            <span>{date(h.at)}</span>
          </li>
        ))}
      </ol>
    </>
  );
}
