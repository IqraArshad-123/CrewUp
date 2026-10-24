import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  Layers,
  Users,
  CalendarDays,
  Code2,
  Palette,
  PenTool,
  ShieldCheck,
} from "lucide-react";
import { Brand } from "@/components/brand";
export default function Home() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <Brand />
        <nav>
          <a href="#how">How it works</a>
          <Link href="/opportunities">Explore roles</Link>
        </nav>
        <div className="nav-actions">
          <Link href="/login" className="text-link">
            Sign in
          </Link>
          <Link href="/register" className="button small">
            Get started <ArrowUpRight size={16} />
          </Link>
        </div>
      </header>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="live-dot" /> YOUR NEXT BIG THING STARTS HERE
            </div>
            <h1>
              Big ideas.
              <br />
              The right people.
              <br />
              <em>One crew.</em>
            </h1>
            <p>
              Bring your project to life with the people it needs. Find your
              next collaborator, open a role, and build your team in one place.
            </p>
            <div className="hero-actions">
              <Link href="/register?role=recruiter" className="button">
                Build your team <ArrowUpRight size={18} />
              </Link>
              <Link href="/opportunities" className="button secondary">
                Find your next project <ArrowRight size={18} />
              </Link>
            </div>
            <div className="hero-proof">
              <ShieldCheck size={18} />
              <span>Verified companies. Clear roles. A shared purpose.</span>
            </div>
          </div>
          <div
            className="hero-visual"
            aria-label="Illustration of a project and its required team roles"
          >
            <div className="visual-top">
              <span className="label">A BETTER WAY TO BUILD</span>
              <span className="badge green">PROJECT → PEOPLE</span>
            </div>
            <div className="project-preview">
              <div className="square-icon lavender">
                <Layers size={25} />
              </div>
              <span className="muted">Your next project</span>
              <h2>
                Something worth
                <br />
                building, together.
              </h2>
              <p>One vision. A whole world of talent.</p>
              <div className="preview-divider" />
              <div className="preview-role">
                <span className="square-icon mint">
                  <Code2 size={19} />
                </span>
                <div>
                  <b>Build the experience</b>
                  <small>Development & engineering</small>
                </div>
                <ArrowUpRight size={18} />
              </div>
              <div className="preview-role">
                <span className="square-icon peach">
                  <Palette size={19} />
                </span>
                <div>
                  <b>Make it memorable</b>
                  <small>Design & creative</small>
                </div>
                <ArrowUpRight size={18} />
              </div>
              <div className="preview-role">
                <span className="square-icon lavender">
                  <PenTool size={19} />
                </span>
                <div>
                  <b>Tell your story</b>
                  <small>Marketing & content</small>
                </div>
                <ArrowUpRight size={18} />
              </div>
            </div>
            <div className="floating-note">
              <span className="check-circle">
                <Check size={17} />
              </span>
              <div>
                <b>Every role has a purpose.</b>
                <small>Keep the whole project in view.</small>
              </div>
            </div>
            <span className="visual-caption">
              FROM YOUR FIRST ROLE TO YOUR FULL TEAM.
            </span>
          </div>
        </section>
        <section className="category-strip">
          <span>MADE FOR TEAMS BUILDING</span>
          <b>
            <Code2 size={19} /> Digital products
          </b>
          <b>
            <Palette size={19} /> Creative campaigns
          </b>
          <b>
            <Layers size={19} /> New ventures
          </b>
        </section>
        <section className="how-section" id="how">
          <div>
            <span className="eyebrow">LESS FRAGMENTATION. MORE CREATION.</span>
            <h2>
              Your project is the starting point.
              <br />
              Your people make it happen.
            </h2>
          </div>
          <div className="how-grid">
            {[
              {
                n: "01",
                icon: Layers,
                t: "Give your idea a home",
                p: "Create a project brief with a clear goal, timeline and the roles you need.",
              },
              {
                n: "02",
                icon: Users,
                t: "Find your people",
                p: "Publish individual roles so candidates can find the work that fits their skills.",
              },
              {
                n: "03",
                icon: CalendarDays,
                t: "See the whole picture",
                p: "Keep every role connected to its project, with clear dates and hiring status.",
              },
            ].map((x) => (
              <article key={x.n}>
                <span className="step-no">{x.n}</span>
                <x.icon size={25} />
                <h3>{x.t}</h3>
                <p>{x.p}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="bottom-cta">
          <div>
            <span className="eyebrow">LET’S MAKE SOMETHING GREAT</span>
            <h2>
              Your next project deserves
              <br />
              the right crew.
            </h2>
          </div>
          <Link href="/register" className="button">
            Create your workspace <ArrowUpRight size={18} />
          </Link>
        </section>
      </main>
      <footer>
        <Brand />
        <span>Built around projects. Powered by people.</span>
        <span>© {new Date().getFullYear()} CrewUp</span>
      </footer>
    </div>
  );
}
