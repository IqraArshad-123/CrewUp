"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Dialog } from "./application-dialog";
export default function AdminRecords({
  kind,
}: {
  kind: "users" | "jobs" | "audit";
}) {
  const [items, setItems] = useState<any[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [target, setTarget] = useState<any>(null),
    [reason, setReason] = useState(""),
    [notice, setNotice] = useState("");
  async function load(more = false) {
    setBusy(true);
    try {
      const d = await api(
        `/admin/records/${kind}?q=${encodeURIComponent(query)}${more && cursor ? "&cursor=" + cursor : ""}`,
      );
      setItems((old) => (more ? [...old, ...d.items] : d.items));
      setCursor(d.nextCursor);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, [kind]);
  return (
    <section className="panel">
      <h2>
        {kind === "users"
          ? "Platform accounts"
          : kind === "jobs"
            ? "Role moderation"
            : "Administration history"}
      </h2>
      <form
        className="row-actions"
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <input
          aria-label="Search records"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={100}
          placeholder="Search records"
        />
        <button className="button secondary" disabled={busy}>
          Search
        </button>
      </form>
      {error && <p className="alert error">{error}</p>}
      {notice && <p className="alert success">{notice}</p>}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{kind === "audit" ? "Action" : "Record"}</th>
              <th>Status / details</th>
              <th>Manage</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i._id}>
                <td>
                  <b>{i.name || i.title || i.action}</b>
                  <small>{i.email || i.reason}</small>
                </td>
                <td>
                  {kind === "users"
                    ? `${i.role} · ${i.status}`
                    : kind === "jobs"
                      ? `${i.status}${i.moderationBlocked ? " · Moderation hold" : ""}`
                      : new Date(i.createdAt).toLocaleString()}
                </td>
                <td>
                  {kind !== "audit" && i.role !== "admin" && (
                    <button
                      className="button secondary small"
                      disabled={busy}
                      onClick={() => {
                        setTarget(i);
                        setReason("");
                      }}
                    >
                      {kind === "users"
                        ? i.status === "active"
                          ? "Suspend"
                          : "Reactivate"
                        : i.moderationBlocked
                          ? "Release hold"
                          : "Close & hold"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!items.length && !busy && <p>No records found.</p>}
      {cursor && (
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void load(true)}
        >
          Load more
        </button>
      )}
      {target && (
        <Dialog
          title="Confirm moderation action"
          onClose={() => setTarget(null)}
        >
          <p>{target.name || target.title}</p>
          <p>
            {kind === "users"
              ? "Changing account status revokes all existing sessions."
              : "Closing a role hides it from the board. Releasing a hold does not automatically publish it."}
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const d = await api(
                  kind === "users"
                    ? `/admin/users/${target._id}/status`
                    : `/admin/jobs/${target._id}/moderation`,
                  {
                    method: "PATCH",
                    body: JSON.stringify(
                      kind === "users"
                        ? {
                            status:
                              target.status === "active"
                                ? "suspended"
                                : "active",
                            reason,
                          }
                        : { blocked: !target.moderationBlocked, reason },
                    ),
                  },
                );
                setNotice(d.message);
                setTarget(null);
                await load();
              } catch (e) {
                setError((e as Error).message);
                setTarget(null);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Reason
              <textarea
                required
                minLength={5}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button className="button" disabled={busy}>
              Confirm change
            </button>
          </form>
        </Dialog>
      )}
    </section>
  );
}
