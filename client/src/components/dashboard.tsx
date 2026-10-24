"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  LayoutDashboard,
  Layers,
  BriefcaseBusiness,
  Users,
  Settings,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Search,
  ChevronDown,
  ChevronRight,
  LogOut,
  Menu,
  X,
  Globe,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ShieldCheck,
  Building2,
  Code2,
  Palette,
  Megaphone,
  MoreHorizontal,
  Mail,
  ExternalLink,
  LoaderCircle,
} from "lucide-react";
import AdminMetrics from "./admin-metrics";
import AdminRecords from "./admin-records";
import TeamWorkspace from "./team-workspace";
import InterviewWorkspace from "./interview-workspace";
import NotificationWorkspace from "./notification-workspace";
import CandidateWorkspace from "./candidate-workspace";
import HiringWorkspace from "./hiring-workspace";
import { Brand } from "./brand";
import { api, date, money } from "@/lib/api";
type RecordData = Record<string, any>;
const categoryIcons: Record<string, typeof Layers> = {
  "Software & technology": Code2,
  "Design & creative": Palette,
  "Marketing & content": Megaphone,
};
export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<RecordData | null>(null);
  const [data, setData] = useState<RecordData>({ projects: [], jobs: [] });
  const [tab, setTab] = useState("Overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState<"company" | "project" | "job" | null>(
    null,
  );
  const [editing, setEditing] = useState<RecordData | null>(null);
  const [busy, setBusy] = useState(false);
  const [mobile, setMobile] = useState(false);
  const load = useCallback(async () => {
    try {
      let u;
      try {
        u = (await api("/auth/me")).user;
      } catch {
        await api("/auth/refresh", { method: "POST" });
        u = (await api("/auth/me")).user;
      }
      setUser(u);
      if (u.role === "recruiter") setData(await api("/workspace"));
      else if (u.role === "admin") setData(await api("/admin"));
      else setData(await api("/candidate"));
      setError("");
    } catch (e) {
      if (!user) router.replace("/login");
      else setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [router, user?.id]);
  useEffect(() => {
    void load();
    const sync = (e: StorageEvent) => {
      if (e.key === "crewup-session-change") {
        setModal(null);
        void load();
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [load]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const company = data.company;
  const projects: RecordData[] = data.projects || [];
  const jobs: RecordData[] = data.jobs || [];
  const recruiter = user?.role === "recruiter";
  const admin = user?.role === "admin";
  const nav = admin
    ? [
        "Overview",
        "Companies",
        "Users",
        "Job moderation",
        "Audit history",
        "Notifications",
      ]
    : recruiter
      ? [
          "Overview",
          "Projects",
          "Open roles",
          "Applications",
          "Interviews",
          "Notifications",
          "Team readiness",
          ...(data.membership &&
          ["owner", "hr_manager"].includes(data.membership.role)
            ? ["Team members"]
            : []),
          "Workspace",
        ]
      : [
          "Overview",
          "My profile",
          "Saved roles",
          "Applications",
          "Interviews",
          "Notifications",
          "Explore roles",
        ];
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (
      requested &&
      ["My profile", "Applications", "Interviews", "Notifications"].includes(
        requested,
      )
    )
      setTab(requested);
  }, []);
  function changeTab(value: string) {
    if (value === "Explore roles") {
      router.push("/opportunities");
      return;
    }
    setTab(value);
    setQuery("");
    setFilter("all");
    setMobile(false);
  }
  async function mutate(path: string, body: unknown, success: string) {
    setBusy(true);
    setError("");
    try {
      await api(path, { method: "PATCH", body: JSON.stringify(body) });
      await load();
      setToast(success);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function open(kind: "company" | "project" | "job", record?: RecordData) {
    setEditing(record || null);
    setModal(kind);
  }
  const matchingProjects = projects.filter(
    (p) =>
      `${p.name} ${p.category}`.toLowerCase().includes(query.toLowerCase()) &&
      (filter === "all" ||
        (filter === "hiring" &&
          jobs.some((j) => j.projectId === p._id && j.status === "open")) ||
        (filter === "draft" &&
          !jobs.some((j) => j.projectId === p._id && j.status === "open"))),
  );
  if (loading)
    return (
      <main className="loading-screen">
        <Brand />
        <LoaderCircle className="spin" />
        <p>Getting your workspace ready…</p>
      </main>
    );
  if (!user) return null;
  return (
    <div className="app-shell">
      <button
        className="mobile-toggle icon-button"
        aria-label="Open navigation"
        onClick={() => setMobile(true)}
      >
        <Menu />
      </button>
      {mobile && (
        <button
          className="sidebar-overlay"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? "is-open" : ""}`}>
        <Brand />
        <button
          className="workspace-picker"
          onClick={() => changeTab(recruiter ? "Workspace" : "Overview")}
        >
          <span className="workspace-avatar">
            {admin ? "A" : recruiter ? company?.name?.[0] || "C" : "P"}
          </span>
          <span>
            <b>
              {admin
                ? "Platform admin"
                : recruiter
                  ? company?.name || "Your workspace"
                  : "Personal workspace"}
            </b>
            <small>
              {admin
                ? "Platform oversight"
                : recruiter
                  ? "Company workspace"
                  : "Candidate account"}
            </small>
          </span>
          <ChevronDown size={15} />
        </button>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          {nav.map((item, i) => {
            const icons: Record<string, typeof Layers> = {
              Overview: LayoutDashboard,
              Companies: Building2,
              Users: Users,
              "Job moderation": BriefcaseBusiness,
              "Audit history": ShieldCheck,
              Projects: Layers,
              "Open roles": BriefcaseBusiness,
              Applications: Users,
              "Team readiness": CheckCircle2,
              Workspace: Settings,
              "Team members": Users,
              "My profile": Settings,
              "Saved roles": Layers,
              "Explore roles": BriefcaseBusiness,
              Interviews: CalendarDays,
              Notifications: Bell,
            };
            const Icon = icons[item] || Layers;
            return (
              <button
                key={item}
                className={tab === item ? "active" : ""}
                onClick={() => changeTab(item)}
              >
                <Icon size={19} />
                {item}
                {item === "Projects" && (
                  <span className="nav-count">{projects.length}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span className="tip-icon">
              <Layers size={19} />
            </span>
            <b>Great things take a crew.</b>
            <p>Give every role a place in the bigger picture.</p>
            <Link href="/opportunities">
              Explore the community <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="sidebar-user">
            <span className="avatar">
              {user.name
                .split(" ")
                .map((x: string) => x[0])
                .slice(0, 2)
                .join("")}
            </span>
            <div>
              <b>{user.name}</b>
              <small>
                {user.role === "recruiter"
                  ? (data.membership?.role || "Recruiter").replaceAll("_", " ")
                  : user.role === "admin"
                    ? "Administrator"
                    : "Candidate"}
              </small>
            </div>
            <button
              className="icon-button"
              title="Sign out"
              aria-label="Sign out"
              onClick={async () => {
                await api("/auth/logout", { method: "POST" });
                localStorage.setItem(
                  "crewup-session-change",
                  String(Date.now()),
                );
                router.push("/login");
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <div>
            <span className="muted">Workspace</span>
            <ChevronRight size={14} />
            <span>{tab}</span>
          </div>
          <div>
            <span className="local-label">
              <span className="live-dot" /> CREWUP
            </span>
            <Link href="/opportunities" className="text-link">
              Public job board <ArrowUpRight size={15} />
            </Link>
          </div>
        </header>
        <main className="dashboard-main">
          {error && (
            <div className="alert error" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
          {!user.verified && (
            <div className="alert warning">
              <Mail size={18} />
              <span>
                <b>Verify your email to continue.</b>{" "}
                {process.env.NODE_ENV !== "production"
                  ? "This preview uses a local test inbox."
                  : "Check your email for the verification link."}
              </span>
              <button
                className="text-link"
                onClick={async () => {
                  try {
                    const r = await api("/auth/resend", { method: "POST" });
                    setToast(r.message);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Resend
              </button>
              {process.env.NODE_ENV !== "production" && (
                <button
                  className="text-link"
                  onClick={async () => {
                    try {
                      const mail = await api("/auth/development-mail");
                      const url = new URL(mail.url);
                      window.location.assign(url.pathname + url.search);
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Open local email
                </button>
              )}
            </div>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {admin
                  ? "PLATFORM AT A GLANCE"
                  : tab === "Overview"
                    ? "A LITTLE CLARITY. A LOT OF POSSIBILITY."
                    : "YOUR NEXT BIG THING"}
              </div>
              <h1>
                {tab === "Team members" ? "Your hiring team." : tab === "Users" ? "Platform accounts." : tab === "Job moderation" ? "Keep roles trustworthy." : tab === "Audit history" ? "Administration history." : tab === "Overview"
                  ? `Welcome back, ${user.name.split(" ")[0]}.`
                  : tab === "Open roles"
                    ? "Every role, one place."
                    : tab === "Workspace"
                      ? "Your company workspace."
                      : tab === "Companies"
                        ? "Company approvals."
                        : tab === "Projects"
                          ? "Make room for what’s next."
                          : tab === "Account"
                            ? "Your account."
                            : tab === "My profile"
                              ? "Your professional profile."
                              : tab === "Applications"
                                ? "Your applications."
                                : tab === "Saved roles"
                                  ? "Your saved roles."
                                  : tab === "Team readiness"
                                    ? "Build a complete team."
                                    : tab === "Interviews"
                                      ? "Make time for your next team."
                                      : tab === "Notifications"
                                        ? "Your notifications."
                                        : "Find your next project."}
              </h1>
              <p>
                {admin
                  ? "Keep CrewUp a trusted place to build great teams."
                  : recruiter
                    ? "Your projects, your people, and the bigger picture. All together."
                    : "Discover the teams building something you’d love to be part of."}
              </p>
            </div>
            {recruiter &&
              ![
                "Interviews",
                "Notifications",
                "Applications",
                "Team readiness",
                ...(data.membership &&
                ["owner", "hr_manager"].includes(data.membership.role)
                  ? ["Team members"]
                  : []),
              ].includes(tab) && (
                <button
                  className="button"
                  disabled={!user.verified}
                  onClick={() =>
                    open(
                      company
                        ? tab === "Open roles"
                          ? "job"
                          : "project"
                        : "company",
                    )
                  }
                >
                  <Plus size={18} />
                  {company
                    ? tab === "Open roles"
                      ? "Create a role"
                      : "Create project"
                    : "Create workspace"}
                </button>
              )}
          </div>
          {admin &&
          ["Users", "Job moderation", "Audit history"].includes(tab) ? (
            <AdminRecords
              key={tab}
              kind={
                tab === "Users"
                  ? "users"
                  : tab === "Job moderation"
                    ? "jobs"
                    : "audit"
              }
            />
          ) : tab === "Notifications" ? (
            <NotificationWorkspace onTab={changeTab} />
          ) : tab === "Interviews" ? (
            <InterviewWorkspace recruiter={!!recruiter} onTab={changeTab} />
          ) : tab === "Team members" && recruiter ? (
            <TeamWorkspace />
          ) : recruiter && !company ? (
            <div className="onboarding panel">
              <div className="square-icon mint">
                <Building2 size={30} />
              </div>
              <h2>A home for your next big idea.</h2>
              <p>
                Create your company workspace, tell us what you do, and start
                shaping your first project. An admin will review your company
                before your jobs go live.
              </p>
              <button
                disabled={!user.verified}
                className="button"
                onClick={() => open("company")}
              >
                Set up company <ArrowRight size={17} />
              </button>
            </div>
          ) : admin ? (
            <>
              <AdminMetrics />
              <div className="stat-grid">
                {[
                  {
                    name: "Companies",
                    value: data.stats?.companies,
                    icon: Building2,
                  },
                  {
                    name: "Projects",
                    value: data.stats?.projects,
                    icon: Layers,
                  },
                  {
                    name: "Roles created",
                    value: data.stats?.jobs,
                    icon: BriefcaseBusiness,
                  },
                  { name: "Accounts", value: data.stats?.users, icon: Users },
                ].map((s) => (
                  <Stat key={s.name} {...s} note="Across the platform" />
                ))}
              </div>
              <section className="panel">
                <div className="section-header">
                  <h2>Company review queue</h2>
                  <span className="badge amber">
                    {
                      data.companies?.filter(
                        (c: RecordData) => c.status === "pending",
                      ).length
                    }{" "}
                    awaiting review
                  </span>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Company</th>
                        <th>Industry</th>
                        <th>Submitted</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.companies?.map((c: RecordData) => (
                        <tr key={c._id}>
                          <td>
                            <b>{c.name}</b>
                            <small>{c.description}</small>
                            {c.website && (
                              <a
                                href={c.website}
                                target="_blank"
                                rel="noreferrer"
                                className="text-link"
                              >
                                Website <ExternalLink size={12} />
                              </a>
                            )}
                          </td>
                          <td>{c.industry}</td>
                          <td>{date(c.createdAt)}</td>
                          <td>
                            <Status value={c.status} />
                          </td>
                          <td>
                            <div className="row-actions">
                              {c.status !== "verified" && (
                                <button
                                  className="button small"
                                  disabled={busy}
                                  onClick={() =>
                                    mutate(
                                      `/admin/companies/${c._id}/status`,
                                      { status: "verified" },
                                      "Company approved. They can now publish roles.",
                                    )
                                  }
                                >
                                  Approve
                                </button>
                              )}
                              {c.status !== "suspended" && (
                                <button
                                  className="button secondary small"
                                  disabled={busy}
                                  onClick={() => {
                                    if (
                                      confirm(
                                        `Suspend ${c.name}? All their open roles will be closed.`,
                                      )
                                    )
                                      void mutate(
                                        `/admin/companies/${c._id}/status`,
                                        { status: "suspended" },
                                        "Company suspended and open roles closed.",
                                      );
                                  }}
                                >
                                  Suspend
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!data.companies?.length && (
                    <Empty
                      title="All clear for now"
                      text="Company registrations will appear here for your review."
                    />
                  )}
                </div>
              </section>
            </>
          ) : recruiter ? (
            <>
              {company.status !== "verified" && (
                <div className="alert warning">
                  <ShieldCheck size={20} />
                  <span>
                    <b>
                      {company.status === "pending"
                        ? "Your company is awaiting approval."
                        : "Your company is suspended."}
                    </b>{" "}
                    {company.status === "pending"
                      ? "You can prepare projects and draft roles while an admin reviews your company."
                      : "Contact the platform admin before publishing more roles."}
                  </span>
                </div>
              )}
              {["Applications", "Team readiness"].includes(tab) ? (
                <HiringWorkspace tab={tab} />
              ) : tab === "Workspace" ? (
                <div className="workspace-details panel">
                  <div className="square-icon mint">
                    <Building2 size={25} />
                  </div>
                  <h2>{company.name}</h2>
                  <Status value={company.status} />
                  <p>{company.description}</p>
                  <dl>
                    <dt>Industry</dt>
                    <dd>{company.industry}</dd>
                    <dt>Website</dt>
                    <dd>{company.website || "Not provided"}</dd>
                    <dt>Account email</dt>
                    <dd>{user.email}</dd>
                    <dt>Your permission</dt>
                    <dd>Company owner</dd>
                  </dl>
                  <div className="quiet-note">
                    Team invitations and additional member permissions are
                    planned for a later milestone.
                  </div>
                </div>
              ) : (
                <>
                  {tab === "Overview" && (
                    <>
                      <div className="stat-grid">
                        <Stat
                          name="Active projects"
                          value={
                            projects.filter((p) => p.status === "active").length
                          }
                          icon={Layers}
                          note="Ideas taking shape"
                        />
                        <Stat
                          name="Open roles"
                          value={jobs.filter((j) => j.status === "open").length}
                          icon={BriefcaseBusiness}
                          note="Ready for the right people"
                        />
                        <Stat
                          name="Draft roles"
                          value={
                            jobs.filter((j) => j.status === "draft").length
                          }
                          icon={PenIcon}
                          note="Waiting in the wings"
                        />
                        <Stat
                          name="Company status"
                          value={
                            company.status === "verified"
                              ? "Verified"
                              : "Pending"
                          }
                          icon={ShieldCheck}
                          note={
                            company.status === "verified"
                              ? "Approved to publish roles"
                              : "Your review is in progress"
                          }
                        />
                      </div>
                      <div className="workspace-banner">
                        <div>
                          <span className="eyebrow">
                            FROM AN IDEA TO A TEAM
                          </span>
                          <h2>Great projects start with a clear vision.</h2>
                          <p>
                            Give your next idea a home. Add the roles that will
                            bring it to life.
                          </p>
                        </div>
                        <button
                          className="button white"
                          onClick={() => open("project")}
                        >
                          Start a project <ArrowUpRight size={18} />
                        </button>
                        <div className="banner-art" aria-hidden="true">
                          <span />
                          <span />
                          <span />
                        </div>
                      </div>
                    </>
                  )}
                  {tab === "Open roles" ? (
                    <section className="panel">
                      <div className="section-header">
                        <div>
                          <h2>
                            Project roles{" "}
                            <span className="count-pill">{jobs.length}</span>
                          </h2>
                          <p className="muted">
                            Draft, publish and manage the roles your projects
                            need.
                          </p>
                        </div>
                      </div>
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Role / project</th>
                              <th>Budget</th>
                              <th>Status</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {jobs.map((j) => (
                              <tr key={j._id}>
                                <td>
                                  <b>{j.title}</b>
                                  <small>
                                    {
                                      projects.find(
                                        (p) => p._id === j.projectId,
                                      )?.name
                                    }
                                  </small>
                                </td>
                                <td>
                                  {money(j.budgetMin, j.currency)} –{" "}
                                  {money(j.budgetMax, j.currency)}
                                </td>
                                <td>
                                  <Status value={j.status} />
                                </td>
                                <td>
                                  <div className="row-actions">
                                    <button
                                      className="button secondary small"
                                      onClick={() => open("job", j)}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      className="button small"
                                      disabled={
                                        busy || company.status !== "verified"
                                      }
                                      onClick={() =>
                                        mutate(
                                          `/workspace/jobs/${j._id}/status`,
                                          {
                                            status:
                                              j.status === "open"
                                                ? "closed"
                                                : "open",
                                          },
                                          j.status === "open"
                                            ? "Role closed."
                                            : "Role is now live on the public board.",
                                        )
                                      }
                                    >
                                      {j.status === "open"
                                        ? "Close role"
                                        : "Publish"}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {!jobs.length && (
                          <Empty
                            title="The right people start with the right roles"
                            text="Create a project, then add your first role."
                          />
                        )}
                      </div>
                    </section>
                  ) : (
                    <div
                      className={tab === "Overview" ? "overview-columns" : ""}
                    >
                      <section>
                        <div className="section-header projects-header">
                          <div>
                            <h2>
                              Your projects{" "}
                              <span className="count-pill">
                                {projects.length}
                              </span>
                            </h2>
                            <p className="muted">
                              A shared goal for every member of your future
                              crew.
                            </p>
                          </div>
                          {tab === "Overview" && (
                            <button
                              className="text-link"
                              onClick={() => changeTab("Projects")}
                            >
                              View all <ArrowRight size={15} />
                            </button>
                          )}
                        </div>
                        <div className="project-toolbar">
                          <div className="tabs">
                            {["all", "hiring", "draft"].map((f) => (
                              <button
                                key={f}
                                className={filter === f ? "active" : ""}
                                onClick={() => setFilter(f)}
                              >
                                {f === "all"
                                  ? "All projects"
                                  : f === "hiring"
                                    ? "Hiring now"
                                    : "Preparing"}
                              </button>
                            ))}
                          </div>
                          <div className="search-field">
                            <Search size={17} />
                            <input
                              aria-label="Search projects"
                              placeholder="Search projects…"
                              value={query}
                              onChange={(e) => setQuery(e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="projects-grid">
                          {matchingProjects.map((p, i) => {
                            const Icon = categoryIcons[p.category] || Layers;
                            const pj = jobs.filter(
                              (j) => j.projectId === p._id,
                            );
                            const openCount = pj.filter(
                              (j) => j.status === "open",
                            ).length;
                            return (
                              <article className="project-card" key={p._id}>
                                <div className="card-top">
                                  <span
                                    className={`square-icon ${["lavender", "mint", "peach", "blue"][i % 4]}`}
                                  >
                                    <Icon size={23} />
                                  </span>
                                  <Status
                                    value={openCount ? "hiring" : "preparing"}
                                  />
                                  <button
                                    className="icon-button"
                                    title="Edit project"
                                    aria-label={`Edit ${p.name}`}
                                    onClick={() => open("project", p)}
                                  >
                                    <MoreHorizontal size={19} />
                                  </button>
                                </div>
                                <span className="card-category">
                                  {p.category}
                                </span>
                                <h3>
                                  <button
                                    onClick={() => {
                                      setEditing(null);
                                      setTab("Open roles");
                                    }}
                                  >
                                    {p.name}
                                  </button>
                                </h3>
                                <p className="card-description">
                                  {p.description}
                                </p>
                                <div className="card-meta">
                                  <span>
                                    <Globe size={14} />
                                    {p.workMode === "remote"
                                      ? "Remote"
                                      : p.location}
                                  </span>
                                  <span>
                                    <CalendarDays size={14} />
                                    {date(p.endDate)}
                                  </span>
                                </div>
                                <div className="role-summary">
                                  <span>
                                    <b>{pj.length}</b>{" "}
                                    {pj.length === 1 ? "role" : "roles"} planned
                                  </span>
                                  <span>{openCount} open</span>
                                </div>
                                <div
                                  className="role-track"
                                  aria-label={`${openCount} of ${pj.length} roles published`}
                                >
                                  <span
                                    style={{
                                      width: `${pj.length ? (openCount / pj.length) * 100 : 0}%`,
                                    }}
                                  />
                                </div>
                                <div className="card-bottom">
                                  <span className="tiny-label">
                                    {openCount
                                      ? "FIND YOUR NEXT COLLABORATOR"
                                      : "BUILD YOUR PROJECT BRIEF"}
                                  </span>
                                  <button
                                    className="text-link"
                                    onClick={() =>
                                      open("job", { projectId: p._id })
                                    }
                                  >
                                    Add role <Plus size={15} />
                                  </button>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                        {!matchingProjects.length && (
                          <Empty
                            title={
                              query
                                ? "No projects match your search"
                                : "Your next idea belongs here"
                            }
                            text={
                              query
                                ? "Try another name or clear the filters."
                                : "Create your first project and give your future team a shared goal."
                            }
                          />
                        )}
                      </section>
                      {tab === "Overview" && (
                        <aside className="right-rail">
                          <section className="panel checklist">
                            <div className="section-header">
                              <h3>Your workspace checklist</h3>
                              <span className="square-icon mint mini">
                                <CheckCircle2 size={17} />
                              </span>
                            </div>
                            <p className="muted">
                              A few small steps. A strong foundation.
                            </p>
                            {[
                              {
                                t: "Create your account",
                                s: "A place to begin",
                                done: true,
                              },
                              {
                                t: "Verify your email",
                                s: "Keep your account secure",
                                done: user.verified,
                              },
                              {
                                t: "Set up your company",
                                s: "Introduce your team",
                                done: !!company,
                              },
                              {
                                t: "Get company approval",
                                s: "Build trust with candidates",
                                done: company.status === "verified",
                              },
                              {
                                t: "Create your first project",
                                s: "Give your idea a home",
                                done: projects.length > 0,
                              },
                              {
                                t: "Publish your first role",
                                s: "Let the right people find you",
                                done: jobs.some((j) => j.status === "open"),
                              },
                            ].map((x) => (
                              <div className="checklist-row" key={x.t}>
                                <span className={x.done ? "done" : "pending"}>
                                  {x.done ? (
                                    <CheckCircle2 size={18} />
                                  ) : (
                                    <span />
                                  )}
                                </span>
                                <div>
                                  <b>{x.t}</b>
                                  <small>{x.s}</small>
                                </div>
                              </div>
                            ))}
                          </section>
                          <section className="insight-card">
                            <span className="eyebrow">
                              A LITTLE HIRING WISDOM
                            </span>
                            <h3>
                              Start with the outcome.
                              <br />
                              Then find the people.
                            </h3>
                            <p>
                              A clear project brief helps every candidate
                              understand where they can make a difference.
                            </p>
                            <button
                              className="text-link"
                              onClick={() => open("project")}
                            >
                              Shape your next project <ArrowUpRight size={16} />
                            </button>
                          </section>
                        </aside>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <CandidateWorkspace
              user={user}
              tab={tab}
              data={data}
              onRefresh={load}
              onTab={changeTab}
            />
          )}
          <div className="dashboard-footer">
            <span>
              <span className="live-dot" /> A little more connected. A lot more
              possible.
            </span>
            <span>CrewUp · Project workspace</span>
          </div>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {modal && (
        <Editor
          kind={modal}
          record={editing}
          projects={projects}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            await load();
            setToast(
              modal === "company"
                ? "Workspace created. Company approval is pending."
                : modal === "project"
                  ? "Your project is ready. Add the roles you need."
                  : editing?._id
                    ? "Role updated."
                    : "Role saved as a draft. Publish it when you’re ready.",
            );
          }}
        />
      )}
    </div>
  );
}
const PenIcon = BriefcaseBusiness;
function Stat({
  name,
  value,
  icon: Icon,
  note,
}: {
  name: string;
  value: number | string;
  icon: typeof Layers;
  note: string;
}) {
  return (
    <article className="stat-card">
      <div>
        <span>{name}</span>
        <Icon size={18} />
      </div>
      <strong>{value ?? 0}</strong>
      <small>{note}</small>
    </article>
  );
}
export function Status({ value }: { value: string }) {
  return (
    <span
      className={`badge ${["verified", "open", "hiring"].includes(value) ? "green" : ["pending", "preparing", "draft"].includes(value) ? "amber" : "neutral"}`}
    >
      <span />
      {(
        {
          verified: "Verified",
          open: "Open",
          hiring: "Hiring now",
          preparing: "Preparing",
          pending: "Pending review",
          draft: "Draft",
          closed: "Closed",
          suspended: "Suspended",
        } as Record<string, string>
      )[value] || value}
    </span>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <Layers size={30} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function Editor({
  kind,
  record,
  projects,
  onClose,
  onSaved,
}: {
  kind: "company" | "project" | "job";
  record: RecordData | null;
  projects: RecordData[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    let body: RecordData = Object.fromEntries(f.entries());
    if (kind === "job")
      body = {
        ...body,
        screeningQuestions: String(body.screeningQuestions || "")
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((text) => ({ text, required: true })),
        budgetMin: Number(body.budgetMin),
        budgetMax: Number(body.budgetMax),
        skills: String(body.skills)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      };
    try {
      await api(
        `/workspace/${kind === "company" ? "company" : kind === "project" ? "projects" : "jobs"}${record?._id ? `/${record._id}` : ""}`,
        { method: record?._id ? "PATCH" : "POST", body: JSON.stringify(body) },
      );
      await onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const field = (
    name: string,
    label: string,
    placeholder: string,
    type = "text",
    required = true,
  ) => (
    <label key={name}>
      {label}
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        defaultValue={
          type === "date" ? record?.[name]?.slice(0, 10) : record?.[name] || ""
        }
        min={type === "number" ? 1 : undefined}
      />
    </label>
  );
  return (
    <dialog
      className="editor-dialog"
      ref={dialog}
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <div className="modal-heading">
        <div>
          <span className="eyebrow">LET’S BRING IT TO LIFE</span>
          <h2>
            {record?._id ? "Edit" : kind === "company" ? "Set up" : "Create"}{" "}
            {kind === "company"
              ? "your company"
              : kind === "project"
                ? "a project"
                : "a role"}
          </h2>
        </div>
        <button
          disabled={busy}
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      <form onSubmit={submit}>
        <p className="muted">
          {kind === "company"
            ? "Tell candidates who they’ll be working with."
            : kind === "project"
              ? "Start with a shared goal. The right people come next."
              : "Be clear about the work, the skills and the budget."}
        </p>
        {kind === "company" ? (
          <>
            {field("name", "Company name", "e.g. Northstar Studio")}
            {field("industry", "Industry", "e.g. Software & technology")}
            {field(
              "website",
              "Website",
              "https://yourcompany.com",
              "url",
              false,
            )}
          </>
        ) : kind === "project" ? (
          <>
            {field("name", "Project name", "e.g. A new way to shop online")}
            <label>
              Category
              <select
                name="category"
                defaultValue={record?.category || "Software & technology"}
              >
                {[
                  "Software & technology",
                  "Design & creative",
                  "Marketing & content",
                  "Operations & other",
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              {field("startDate", "Start date", "", "date")}
              {field("endDate", "End date", "", "date")}
            </div>
            <div className="form-grid">
              <label>
                Work arrangement
                <select
                  name="workMode"
                  defaultValue={record?.workMode || "remote"}
                >
                  <option value="remote">Remote</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="onsite">On-site</option>
                </select>
              </label>
              {field(
                "location",
                "Location",
                "e.g. Lahore, Pakistan",
                "text",
                false,
              )}
            </div>
          </>
        ) : (
          <>
            <label>
              Project
              <select
                name="projectId"
                required
                defaultValue={record?.projectId || ""}
              >
                <option value="" disabled>
                  Select a project
                </option>
                {projects.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            {!projects.length && (
              <div className="alert warning">
                Create a project before adding a role.
              </div>
            )}
            {field("title", "Role title", "e.g. Frontend developer")}
            <label>
              Skills
              <input
                name="skills"
                required
                placeholder="React, TypeScript, Next.js"
                defaultValue={record?.skills?.join(", ") || ""}
              />
              <small>Separate skills with commas.</small>
            </label>
            <div className="form-grid">
              {field("budgetMin", "Minimum budget", "", "number")}
              {field("budgetMax", "Maximum budget", "", "number")}
            </div>
            <div className="form-grid">
              <label>
                Currency
                <select
                  name="currency"
                  defaultValue={record?.currency || "USD"}
                >
                  {["USD", "PKR", "GBP", "EUR"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Employment type
                <select
                  name="employmentType"
                  defaultValue={record?.employmentType || "contract"}
                >
                  <option value="contract">Project contract</option>
                  <option value="full_time">Full-time</option>
                  <option value="part_time">Part-time</option>
                  <option value="internship">Internship</option>
                </select>
              </label>
            </div>
          </>
        )}
        {kind === "job" && (
          <label>
            Screening questions (optional)
            <textarea
              name="screeningQuestions"
              rows={3}
              defaultValue={
                record?.screeningQuestions
                  ?.map((q: any) => q.text)
                  .join("\n") || ""
              }
              placeholder="One question per line, up to 5. Each answer is required."
            />
          </label>
        )}
        <label>
          {kind === "company"
            ? "About your company"
            : kind === "project"
              ? "Project brief"
              : "Responsibilities & deliverables"}
          <textarea
            name="description"
            required
            minLength={20}
            maxLength={4000}
            rows={4}
            placeholder="Share a little detail (at least 20 characters)…"
            defaultValue={record?.description || ""}
          />
        </label>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="button"
            disabled={busy || (kind === "job" && !projects.length)}
          >
            {busy
              ? "Saving…"
              : record?._id
                ? "Save changes"
                : kind === "job"
                  ? "Save draft"
                  : kind === "company"
                    ? "Create workspace"
                    : "Create project"}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </dialog>
  );
}
