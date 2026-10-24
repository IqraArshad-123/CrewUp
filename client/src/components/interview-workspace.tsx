"use client";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { Dialog } from "./application-dialog";
import { interviewTime, localInput, zonedToISO } from "@/lib/interview-time";
export function ScheduleInterview({
  application,
  interview,
  onClose,
  onSaved,
}: {
  application?: any;
  interview?: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [zone, setZone] = useState(
      interview?.timeZone ||
        Intl.DateTimeFormat().resolvedOptions().timeZone ||
        "Asia/Karachi",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    try {
      const details = {
        title: f.get("title"),
        startsAt: zonedToISO(String(f.get("startsAt")), zone),
        durationMinutes: Number(f.get("durationMinutes")),
        timeZone: zone,
        meetingUrl: f.get("meetingUrl"),
        location: f.get("location"),
        instructions: f.get("instructions"),
      };
      await api(interview ? `/interviews/${interview._id}` : "/interviews", {
        method: interview ? "PATCH" : "POST",
        body: JSON.stringify(
          interview
            ? { version: interview.version, details }
            : {
                applicationId: application._id,
                version: application.version,
                stage: f.get("stage"),
                details,
              },
        ),
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const zones = [
    ...new Set([
      zone,
      "Asia/Karachi",
      "UTC",
      "Asia/Dubai",
      "Europe/London",
      "America/New_York",
      "Asia/Kolkata",
    ]),
  ];
  return (
    <Dialog
      title={interview ? "Reschedule interview" : "Schedule an interview"}
      onClose={() => !busy && onClose()}
    >
      <p className="muted">
        {application?.snapshot?.candidate?.name ||
          interview?.application?.snapshot?.candidate?.name}{" "}
        ·{" "}
        {application?.snapshot?.job?.title ||
          interview?.application?.snapshot?.job?.title}
      </p>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      <form className="hiring-form" onSubmit={submit}>
        <label>
          Interview title
          <input
            name="title"
            defaultValue={interview?.title || "Project conversation"}
            minLength={3}
            maxLength={120}
            required
          />
        </label>
        {!interview && (
          <label>
            Application stage
            <select
              name="stage"
              defaultValue={
                application.stage === "final_interview"
                  ? "final_interview"
                  : "interview"
              }
            >
              {application.stage !== "final_interview" && (
                <option value="interview">Interview</option>
              )}
              <option value="final_interview">Final interview</option>
            </select>
          </label>
        )}
        <div className="hiring-two">
          <label>
            Date and time
            <input
              name="startsAt"
              type="datetime-local"
              required
              defaultValue={
                interview
                  ? localInput(interview.startsAt, interview.timeZone)
                  : ""
              }
            />
          </label>
          <label>
            Timezone
            <select value={zone} onChange={(e) => setZone(e.target.value)}>
              {zones.map((z) => (
                <option key={z}>{z}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted">
          The date and time above use the selected timezone. Participants also
          see their own local time.
        </p>
        <label>
          Duration
          <select
            name="durationMinutes"
            defaultValue={
              interview
                ? (new Date(interview.endsAt).getTime() -
                    new Date(interview.startsAt).getTime()) /
                  60000
                : 30
            }
          >
            {[15, 30, 45, 60, 90, 120, 180, 240].map((n) => (
              <option value={n} key={n}>
                {n} minutes
              </option>
            ))}
          </select>
        </label>
        <label>
          Meeting link (HTTPS)
          <input
            name="meetingUrl"
            type="url"
            maxLength={500}
            defaultValue={interview?.meetingUrl || ""}
            placeholder="https://meet.google.com/…"
          />
        </label>
        <label>
          Or meeting location
          <input
            name="location"
            maxLength={300}
            defaultValue={interview?.location || ""}
            placeholder="Office address or meeting room"
          />
        </label>
        <label>
          Instructions for the candidate
          <textarea
            name="instructions"
            maxLength={2000}
            rows={3}
            defaultValue={interview?.instructions || ""}
          />
        </label>
        <div className="quiet-note">
          The candidate will receive an in-app notification. Email is queued
          separately. Scheduling also advances the application to the selected
          interview stage.
        </div>
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
              ? "Saving…"
              : interview
                ? "Save new details"
                : "Schedule interview"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
export default function InterviewWorkspace({
  recruiter,
  onTab,
}: {
  recruiter: boolean;
  onTab: (t: string) => void;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [detail, setDetail] = useState<any>(null),
    [editing, setEditing] = useState<any>(null),
    [filter, setFilter] = useState("");
  const load = useCallback(
    async (cursor?: string) => {
      const q = new URLSearchParams();
      if (filter) q.set("status", filter);
      if (cursor) q.set("cursor", cursor);
      const d = await api(`/interviews?${q}`);
      setData((old: any) =>
        cursor ? { ...d, interviews: [...old.interviews, ...d.interviews] } : d,
      );
    },
    [filter],
  );
  useEffect(() => {
    setError("");
    void load().catch((e) => setError(e.message));
  }, [load]);
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  async function action(kind: string, body: any) {
    setBusy(true);
    setError("");
    try {
      await api(`/interviews/${detail._id}/${kind}`, {
        method: "PATCH",
        body: JSON.stringify({ ...body, version: detail.version }),
      });
      setDetail(null);
      await load();
      setMessage(
        kind === "cancel"
          ? "Interview cancelled. Candidate notified."
          : "Feedback recorded and application updated.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function calendar(i: any) {
    setBusy(true);
    setError("");
    try {
      let r = await fetch(`/api/interviews/${i._id}/calendar`);
      if (r.status === 401) {
        await api("/auth/refresh", { method: "POST" });
        r = await fetch(`/api/interviews/${i._id}/calendar`);
      }
      if (!r.ok)
        throw new Error("Calendar download failed. Refresh and try again.");
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "crewup-interview.ics";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="hiring-workspace">
      <div className="hiring-section-head">
        <div>
          <span className="eyebrow">MEET YOUR NEXT TEAM</span>
          <h2>A conversation worth making time for.</h2>
          <p className="muted">
            Your local timezone: {localZone}. Calendar downloads preserve the
            exact interview time.
          </p>
        </div>
        {recruiter && (
          <button className="button" onClick={() => onTab("Applications")}>
            Choose an applicant →
          </button>
        )}
      </div>
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
      <div className="hiring-filters">
        <label>
          Show interviews
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All interviews</option>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
      </div>
      {!data && !error && <p>Loading your interviews…</p>}
      <div className="interview-grid">
        {data?.interviews.map((i: any) => (
          <article className="panel interview-card" key={i._id}>
            <div className="hiring-section-head">
              <span className="eyebrow">
                {i.application?.snapshot?.job?.title}
              </span>
              <span
                className={`badge ${i.status === "scheduled" ? "green" : "neutral"}`}
              >
                {i.status}
              </span>
            </div>
            <h3>{i.title}</h3>
            {recruiter && <p>{i.application?.snapshot?.candidate?.name}</p>}
            <div className="interview-date">
              <b>{interviewTime(i.startsAt, localZone)}</b>
              <small>
                {(new Date(i.endsAt).getTime() -
                  new Date(i.startsAt).getTime()) /
                  60000}{" "}
                minutes · {localZone}
              </small>
            </div>
            {i.timeZone !== localZone && (
              <p className="muted">
                Organizer time: {interviewTime(i.startsAt, i.timeZone)} (
                {i.timeZone})
              </p>
            )}
            <div className="hiring-actions">
              <button
                className="button secondary small"
                onClick={() => {
                  setError("");
                  setDetail(i);
                }}
              >
                View details
              </button>
              <button
                className="text-link"
                disabled={busy}
                onClick={() => void calendar(i)}
              >
                Add to calendar ↓
              </button>
            </div>
          </article>
        ))}
      </div>
      {data && !data.interviews.length && (
        <div className="empty-state">
          <h3>No interviews here yet.</h3>
          <p>
            {recruiter
              ? "Open an application and choose Schedule interview."
              : "Your scheduled interviews will appear here when a company invites you."}
          </p>
        </div>
      )}
      {data?.nextCursor && (
        <button
          className="button secondary"
          onClick={() =>
            void load(data.nextCursor).catch((e) => setError(e.message))
          }
        >
          Load more interviews
        </button>
      )}
      {editing && (
        <ScheduleInterview
          interview={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setMessage("Interview rescheduled. Candidate notified.");
            void load().catch((e) => setError(e.message));
          }}
        />
      )}
      {detail && (
        <Dialog title={detail.title} onClose={() => !busy && setDetail(null)}>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          <p>
            <b>{interviewTime(detail.startsAt, localZone)}</b> ({localZone})
          </p>
          <p className="muted">
            {detail.application?.snapshot?.job?.title} ·{" "}
            {detail.application?.snapshot?.candidate?.name}
          </p>
          {detail.status === "scheduled" && detail.meetingUrl && (
            <a
              className="button"
              href={detail.meetingUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open meeting link ↗
            </a>
          )}
          {detail.location && <p>Location: {detail.location}</p>}
          <p className="preserve-lines">
            {detail.instructions || "No additional instructions."}
          </p>
          {detail.cancellationReason && (
            <div className="quiet-note">
              Cancelled: {detail.cancellationReason}
            </div>
          )}
          {detail.status === "completed" && (
            <p className="quiet-note">
              Outcome:{" "}
              {detail.outcome === "moved_forward"
                ? "Moved forward"
                : "Not selected"}
            </p>
          )}
          {data.canManage && detail.status === "scheduled" && (
            <>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => {
                  setEditing(detail);
                  setDetail(null);
                }}
              >
                Reschedule
              </button>
              <form
                className="hiring-form application-section"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void action("feedback", {
                    feedback: f.get("feedback"),
                    outcome: f.get("outcome"),
                  });
                }}
              >
                <h3>Private interview feedback</h3>
                <label>
                  Feedback
                  <textarea
                    name="feedback"
                    rows={3}
                    required
                    minLength={10}
                    maxLength={4000}
                  />
                </label>
                <label>
                  Outcome
                  <select name="outcome">
                    <option value="moved_forward">
                      Move forward one stage
                    </option>
                    <option value="rejected">Not selected</option>
                  </select>
                </label>
                <label className="check-label">
                  <input type="checkbox" required /> Record this final feedback
                  and update the application.
                </label>
                <button
                  className="button"
                  disabled={busy || new Date(detail.endsAt) > new Date()}
                >
                  Complete interview
                </button>
                {new Date(detail.endsAt) > new Date() && (
                  <small className="muted">
                    Feedback opens after the scheduled end time. Refresh this
                    page after the interview.
                  </small>
                )}
              </form>
              <form
                className="hiring-form application-section"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action("cancel", {
                    reason: new FormData(e.currentTarget).get("reason"),
                  });
                }}
              >
                <label>
                  Cancellation reason
                  <input name="reason" required minLength={5} maxLength={500} />
                </label>
                <button className="button secondary" disabled={busy}>
                  Cancel interview & notify candidate
                </button>
              </form>
            </>
          )}
          {recruiter && detail.feedback && (
            <section className="quiet-note">
              <b>Private team feedback</b>
              <p className="preserve-lines">{detail.feedback}</p>
            </section>
          )}
        </Dialog>
      )}
    </div>
  );
}
