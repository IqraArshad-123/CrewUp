"use client";
import { useEffect, useState } from "react";
import { api, date } from "@/lib/api";
export default function NotificationWorkspace({
  onTab,
}: {
  onTab: (t: string) => void;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load(cursor?: string) {
    const d = await api(`/notifications${cursor ? "?cursor=" + cursor : ""}`);
    setData((old: any) =>
      cursor
        ? { ...d, notifications: [...old.notifications, ...d.notifications] }
        : d,
    );
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  async function read(id?: string) {
    setBusy(true);
    setError("");
    try {
      await api(id ? `/notifications/${id}/read` : "/notifications/read-all", {
        method: "PATCH",
      });
      await load();
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
          <span className="eyebrow">STAY IN THE LOOP</span>
          <h2>Your latest updates.</h2>
          <p className="muted">
            {data
              ? `${data.unread} unread notifications`
              : "Loading notifications…"}
          </p>
        </div>
        <button
          className="button secondary"
          disabled={busy || !data?.unread}
          onClick={() => void read()}
        >
          Mark all as read
        </button>
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {data?.notifications.map((n: any) => (
        <article
          className={`panel notification-card ${n.readAt ? "" : "unread"}`}
          key={n._id}
        >
          <div>
            <span className="eyebrow">
              {date(n.createdAt)} {!n.readAt ? " · NEW" : ""}
            </span>
            <h3>{n.title}</h3>
            <p>{n.message}</p>
          </div>
          <div className="hiring-actions">
            <button
              className="text-link"
              onClick={() => {
                void read(n._id);
                onTab(n.tab);
              }}
            >
              View {n.tab.toLowerCase()} →
            </button>
            {!n.readAt && (
              <button
                className="text-link"
                disabled={busy}
                onClick={() => void read(n._id)}
              >
                Mark read
              </button>
            )}
          </div>
        </article>
      ))}
      {data && !data.notifications.length && (
        <div className="empty-state">
          <h3>You’re all caught up.</h3>
          <p>Application and interview updates will appear here.</p>
        </div>
      )}
      {data?.nextCursor && (
        <button
          className="button secondary"
          onClick={() =>
            void load(data.nextCursor).catch((e) => setError(e.message))
          }
        >
          Load more
        </button>
      )}
    </div>
  );
}
