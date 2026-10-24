import Link from "next/link";
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link
      href="/"
      className={`brand ${light ? "light" : ""}`}
      aria-label="CrewUp home"
    >
      <span className="brand-mark">
        <i />
        <i />
        <i />
      </span>
      Crew<span className="brand-up">Up</span>
      <span className="brand-dot">.</span>
    </Link>
  );
}
