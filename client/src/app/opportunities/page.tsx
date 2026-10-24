"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Search, ArrowUpRight, Globe, Layers, ArrowRight } from "lucide-react";
import { Brand } from "@/components/brand";
import { api, money } from "@/lib/api";
import ApplicationDialog, { Dialog } from "@/components/application-dialog";
export default function Opportunities() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [location,setLocation]=useState(""),[employment,setEmployment]=useState(""),[searchMode,setSearchMode]=useState("literal");
  const [cursor, setCursor] = useState<string | null>(null),
    [mode, setMode] = useState(""),
    [currency, setCurrency] = useState(""),
    [budget, setBudget] = useState(""),
    [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [user, setUser] = useState<any>(null),
    [candidate, setCandidate] = useState<any>(null),
    [applying, setApplying] = useState<any>(null),
    [notice, setNotice] = useState(""),
    [saving, setSaving] = useState(false);
  async function loadCandidate() {
    setCandidate(await api("/candidate"));
  }
  useEffect(() => {
    api("/auth/me")
      .catch(async () => {
        await api("/auth/refresh", { method: "POST" });
        return api("/auth/me");
      })
      .then((d) => {
        setUser(d.user);
        if (d.user.role === "applicant") void loadCandidate().catch(() => {});
      })
      .catch(() => {});
  }, []);
  async function saveRole(j: any) {
    setSaving(true);
    setError("");
    try {
      const saved = candidate?.savedJobs?.some((s: any) => s._id === j._id);
      await api(saved ? `/candidate/saved/${j._id}` : "/candidate/saved", {
        method: saved ? "DELETE" : "POST",
        ...(saved ? {} : { body: JSON.stringify({ jobId: j._id }) }),
      });
      await loadCandidate();
      setNotice(
        saved
          ? "Role removed from your shortlist."
          : "Role saved to your shortlist.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  function boardUrl(next?: string | null) {
    const p = new URLSearchParams({ q: search });
    if(location)p.set("location",location);
    if(employment)p.set("employmentType",employment);
    p.set("searchMode",searchMode);
    if (mode) p.set("workMode", mode);
    if (currency) p.set("currency", currency);
    if (budget) p.set("minBudget", budget);
    if (next) p.set("cursor", next);
    return "/public/jobs?" + p;
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api(boardUrl())
      .then((d) => {
        if (active) {
          setJobs(d.jobs);
          setCursor(d.nextCursor);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [search, mode, currency, budget, location, employment, searchMode]);
  async function more() {
    setLoading(true);
    try {
      const d = await api(boardUrl(cursor));
      setJobs((old) => [
        ...old,
        ...d.jobs.filter((j: any) => !old.some((o) => o._id === j._id)),
      ]);
      setCursor(d.nextCursor);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  const visible = jobs;
  return (
    <div className="landing">
      <header className="landing-nav">
        <Brand />
        <nav>
          <Link href="/">Home</Link>
          <Link href="/dashboard">My workspace</Link>
        </nav>
        <Link href="/register" className="button small">
          Join CrewUp <ArrowUpRight size={16} />
        </Link>
      </header>
      <main className="opportunities">
        <span className="eyebrow">GOOD PEOPLE. MEANINGFUL PROJECTS.</span>
        <h1>
          Find your part
          <br />
          in the next big thing.
        </h1>
        <p className="muted">
          Open roles from verified companies, connected to real projects.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(query);
          }}
        >
          <div className="search-field large">
            <Search size={20} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by role, skill or company"
              aria-label="Search roles"
            />
          </div>
          <button className="button secondary" type="submit">
            Search all roles
          </button>
        </form>
        <div className="board-filters">
          <label>Search style<select value={searchMode} onChange={e=>setSearchMode(e.target.value)}><option value="literal">Phrase, skill or company</option><option value="keywords">Keywords in role details</option></select></label>
          <label>Employment type<select value={employment} onChange={e=>setEmployment(e.target.value)}><option value="">Any type</option><option value="contract">Contract</option><option value="full_time">Full time</option><option value="part_time">Part time</option><option value="internship">Internship</option></select></label>
          <label>Location<input value={location} onChange={e=>setLocation(e.target.value)} maxLength={100} placeholder="City or region"/></label>
          <label>
            Work mode
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="">Any work mode</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
              <option value="onsite">On site</option>
            </select>
          </label>
          <label>
            Currency
            <select
              value={currency}
              onChange={(e) => {
                setCurrency(e.target.value);
                if (!e.target.value) setBudget("");
              }}
            >
              <option value="">Any currency</option>
              {["USD", "PKR", "GBP", "EUR"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Minimum budget
            <input
              type="number"
              min="0"
              disabled={!currency}
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="Choose currency first"
            />
          </label>
        </div>
        {error && <div className="alert error">{error}</div>}
        {notice && (
          <div className="alert success" role="status">
            {notice}
          </div>
        )}
        <p className="muted">
          {loading
            ? "Finding open roles…"
            : `${visible.length} roles loaded${cursor ? " · More available" : ""}`}
        </p>
        <div className="opportunity-grid">
          {visible.map((j) => (
            <article className="project-card" key={j._id}>
              <div className="card-top">
                <span className="square-icon mint">
                  <Layers size={22} />
                </span>
                <span className="badge green">Verified company</span>
              </div>
              <span className="card-category">{j.company?.name}</span>
              <h3>{j.title}</h3>
              <p>{j.project?.name}</p>
              <div className="skill-tags">
                {j.skills.map((s: string) => (
                  <span key={s}>{s}</span>
                ))}
              </div>
              <div className="card-meta">
                <span>
                  <Globe size={15} />
                  {j.project?.workMode || "Remote"}
                </span>
              </div>
              <div className="card-bottom">
                <b>
                  {money(j.budgetMin, j.currency)} –{" "}
                  {money(j.budgetMax, j.currency)}
                </b>
                <button className="text-link" onClick={() => setSelected(j)}>
                  View role <ArrowUpRight size={16} />
                </button>
              </div>
              {user?.role === "applicant" && (
                <button
                  className="text-link save-role"
                  disabled={saving || !user.verified}
                  onClick={() => void saveRole(j)}
                >
                  {candidate?.savedJobs?.some((s: any) => s._id === j._id)
                    ? "✓ Saved · remove"
                    : "＋ Save role"}
                </button>
              )}
            </article>
          ))}
        </div>
        {cursor && (
          <button
            className="button secondary"
            disabled={loading}
            onClick={() => void more()}
          >
            Load more roles
          </button>
        )}
        {!loading && !visible.length && (
          <div className="empty-state">
            <Layers />
            <h3>
              {query
                ? "No roles match that search."
                : "Good things are on their way."}
            </h3>
            <p>
              {query
                ? "Try another role or skill."
                : "Published roles from approved companies will appear here."}
            </p>
          </div>
        )}
        {selected && (
          <Dialog title="Role details" onClose={() => setSelected(null)}>
            <span className="eyebrow">{selected.company?.name}</span>
            <h2>{selected.title}</h2>
            <p className="preserve-lines">{selected.description}</p>
            <h3>About the project</h3>
            <p>{selected.project?.description}</p>
            <p className="muted">
              {selected.project?.startDate?.slice(0, 10)} –{" "}
              {selected.project?.endDate?.slice(0, 10)} ·{" "}
              {selected.project?.workMode}
            </p>
            <p>
              {money(selected.budgetMin, selected.currency)} –{" "}
              {money(selected.budgetMax, selected.currency)}
            </p>
            {user?.role === "applicant" ? (
              candidate?.applications?.some(
                (a: any) => a.jobId === selected._id,
              ) ? (
                <div className="quiet-note">
                  You have already applied.{" "}
                  <Link href="/dashboard">View your applications →</Link>
                </div>
              ) : (
                <>
                  <button
                    className="button"
                    disabled={!user.verified}
                    onClick={() => {
                      setApplying(selected);
                      setSelected(null);
                    }}
                  >
                    Apply for this role →
                  </button>
                  {!user.verified && (
                    <p>
                      Verify your email from your workspace before applying.
                    </p>
                  )}
                </>
              )
            ) : (
              <Link className="button" href="/login">
                Sign in as a candidate to apply →
              </Link>
            )}
          </Dialog>
        )}
        {applying && (
          <ApplicationDialog
            jobs={[applying]}
            onClose={() => setApplying(null)}
            onSaved={(m) => {
              setApplying(null);
              setNotice(m);
              void loadCandidate();
            }}
          />
        )}
      </main>
    </div>
  );
}
