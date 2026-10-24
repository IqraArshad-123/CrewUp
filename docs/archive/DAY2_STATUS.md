# Day 2 — completed local milestone

Implemented candidate profiles, availability, portfolio links, private versioned PDF CV uploads, saved roles, individual/batch applications, screening questions, immutable submission snapshots, candidate timelines/withdrawal, recruiter review/private notes, forward-only stages and project role coverage.

Stack remains Next.js/TypeScript + Node.js/Express + MongoDB. The cream/navy/teal design is retained across desktop and mobile.

## Verification

- `npm run typecheck`: passed.
- `npm test`: all 6 integration tests passed; the Day 2 scenario checks private file access, binary integrity, invalid uploads, screening validation, atomic rollback, concurrent duplicates, snapshot preservation, reviewer permissions, private notes, stale versions, terminal stages, withdrawal and coverage.
- `npm run build`: passed.
- Browser: saved the fictional Ayesha profile, uploaded a PDF through the real form, saved two roles, submitted two tailored applications, saved recruiter notes, marked the fictional frontend application hired, and verified 1/2 commerce roles covered.
- Browser: private CV download succeeded. Candidate application list and details checked at a 390 × 844 mobile viewport; desktop recruiter review/readiness also checked. Viewport override restored.

## Try it

Open http://127.0.0.1:3000/login. Choose the Applicant or Recruiter sample login, then Sign in. Password for both: `CrewUpDemo!2026`.

Applicant: My profile → Explore roles → save/apply → Applications.

Recruiter: Applications → Review application → notes/stage → Team readiness.

The demo applicant now has a fictional profile/CV, a hired frontend application and an applied backend application. No real hiring decision or external communication was made.

## Remaining boundary

This is a local Day 2 milestone, not a public production launch. Live email, interview scheduling, notifications, deployment hardening, malware scanning, retention/temporary-file cleanup and other deferred course chapters remain future work. CVs currently use private local disk storage. The optional S3-compatible adapter is implemented but has not been verified against live cloud storage. See README for configuration and operational requirements.
