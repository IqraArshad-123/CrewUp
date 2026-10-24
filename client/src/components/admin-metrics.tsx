"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
export default function AdminMetrics() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    api("/admin/metrics")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <section className="panel">
      <h2>Hiring across CrewUp</h2>
      {error && <p className="alert error">{error}</p>}
      {data && (
        <>
          <div className="board-filters">
            <p>
              <b>{data.applications}</b> applications
            </p>
            <p>
              <b>{data.interviews}</b> scheduled interviews
            </p>
            <p>
              <b>{data.failedEmails}</b> failed emails
            </p>
          </div>
          <p className="muted">
            {data.pendingCompanies} companies awaiting review ·{" "}
            {data.suspendedUsers} suspended accounts
          </p>
          <div className="skill-tags">
            {data.stages.map((s: any) => (
              <span key={s._id}>
                {s._id.replaceAll("_", " ")}: {s.count}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
