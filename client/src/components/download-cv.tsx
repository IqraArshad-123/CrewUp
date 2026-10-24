"use client";
import { useState } from "react";
import { api } from "@/lib/api";
export default function DownloadCV({
  id,
  filename,
}: {
  id: string;
  filename: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function download() {
    setBusy(true);
    setError("");
    try {
      let r = await fetch(`/api/files/resumes/${id}`);
      if (r.status === 401) {
        await api("/auth/refresh", { method: "POST" });
        r = await fetch(`/api/files/resumes/${id}`);
      }
      if (!r.ok)
        throw new Error(
          (await r.json()).error?.message || "CV download failed.",
        );
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button
        type="button"
        className="text-link"
        disabled={busy}
        onClick={() => void download()}
      >
        {busy ? "Downloading…" : `Download ${filename} ↓`}
      </button>
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
