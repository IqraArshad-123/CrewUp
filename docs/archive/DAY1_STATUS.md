# Day 1 handoff

Implemented on 23 October 2026. Scope: the first milestone of CrewUp's three-day demo.

## Verified

- TypeScript check passed.
- Next.js production build passed.
- Five database-backed integration tests passed, including local inbox authorization, email verification, tenant isolation, approval/suspension, validation, refresh replay rejection and logout revocation.
- npm dependency audit reported zero vulnerabilities at installation.
- Real local MongoDB seeded with fictional company, projects, roles and three demo accounts.
- Browser checks: desktop landing/dashboard at 1440px; landing at 360px; project form at 390px. The small-screen landing had no horizontal page overflow. Mobile header spacing was corrected after inspection.
- Recruiter demo login and dashboard data loading verified in the browser; project creation through the Next-to-Express proxy verified. A mobile submission encountered a shared-browser account change while the preview was being used; the API correctly rejected the mismatched company access. Cross-tab account synchronization was added. The temporary API test project was removed.

## Boundaries

- Real email delivery is not configured. The authenticated local test inbox supports verification during development; production registration/resend is intentionally disabled.
- No GitHub push or public deployment has been performed.
- Day 2 candidate profiles, CV uploads, applications and hiring workflows have not been started.
- Database storage is configured on disk; a full stop/restart persistence test was not performed while the preview was in use.
- Responsive checks used browser viewport sizes, not physical iOS/Android devices.

See README.md for startup, sample accounts, usage and remaining production work. Preview screenshots are saved alongside this project as `../crewup-desktop.jpg` and `../crewup-mobile.jpg`.
