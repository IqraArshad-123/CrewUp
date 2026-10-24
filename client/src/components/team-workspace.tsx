"use client";

import { useState, useEffect } from "react";

import { api } from "@/lib/api";

export default function TeamWorkspace() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);

  async function load() {
    setData(await api("/team"));
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);

  async function act(path: string, method: string, body?: any) {
    setBusy(true);
    setError("");
    try {
      const r = await api(path, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      setNotice(r.message);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <span className="eyebrow">YOUR HIRING TEAM</span>
      <h2>The people behind your projects.</h2>
      <p className="muted">
        Owners invite and manage members. HR managers can view the team. Hiring
        managers review applications without changing decisions.
      </p>
      {error && <div className="alert error">{error}</div>}
      {notice && (
        <div className="alert success" role="status">
          {notice}
        </div>
      )}
      {data?.canEdit && (
        <form
          className="form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void act("/team/invitations", "POST", {
              email: f.get("email"),
              role: f.get("role"),
            });
          }}
        >
          <label>
            Email address
            <input name="email" type="email" required maxLength={254} />
          </label>
          <label>
            Company role
            <select name="role">
              <option value="recruiter">Recruiter</option>
              <option value="hr_manager">HR manager</option>
              <option value="hiring_manager">Hiring manager (read only)</option>
            </select>
          </label>
          <button className="button" disabled={busy}>
            Send invitation
          </button>
          <p className="muted">
            Invitations expire after 7 days. Sending again replaces the previous
            link.
          </p>
        </form>
      )}

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Member</th>
              <th>Role</th>
              <th>Manage</th>
            </tr>
          </thead>
          <tbody>
            {data?.members.map((m: any) => (
              <tr key={m._id}>
                <td>
                  <b>{m.user?.name}</b>
                  <small>
                    {m.user?.email} · {m.user?.status}
                  </small>
                </td>
                <td>{m.role.replaceAll("_", " ")}</td>
                <td>
                  {data.canEdit && m.role !== "owner" ? (
                    <div className="row-actions">
                      <select
                        aria-label={`Role for ${m.user?.name}`}
                        value={m.role}
                        disabled={busy}
                        onChange={(e) => {
                          if (
                            confirm(
                              `Change ${m.user?.name}'s company permissions?`,
                            )
                          )
                            void act(`/team/members/${m._id}`, "PATCH", {
                              role: e.target.value,
                              version: m.__v,
                            });
                        }}
                      >
                        <option value="hr_manager">HR manager</option>
                        <option value="recruiter">Recruiter</option>
                        <option value="hiring_manager">Hiring manager</option>
                      </select>
                      <button
                        className="button secondary small"
                        disabled={busy}
                        onClick={() => {
                          if (
                            confirm(`Remove ${m.user?.name} from this company?`)
                          )
                            void act(`/team/members/${m._id}`, "DELETE");
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    "Protected"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Pending invitations</h3>
      {data?.invitations.length === 0 && (
        <p className="muted">No pending invitations.</p>
      )}
      {data?.invitations.map((i: any) => (
        <div className="management-row" key={i._id}>
          <span>
            {i.email} · {i.role.replaceAll("_", " ")}
            <small>Expires {new Date(i.expiresAt).toLocaleDateString()}</small>
          </span>
          {data.canEdit && (
            <button
              className="button secondary small"
              disabled={busy}
              onClick={() => void act(`/team/invitations/${i._id}`, "DELETE")}
            >
              Revoke
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
