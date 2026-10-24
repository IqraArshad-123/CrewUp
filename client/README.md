# Frontend — Next.js

`src/app` contains App Router pages: home, opportunities, login/register, dashboard, invitations, email verification and password recovery. `src/app/api/[...path]/route.ts` forwards same-origin browser API calls to Express. Business logic and database access belong to the backend.

`src/components` contains reusable screens. `dashboard.tsx` selects applicant, recruiter or admin navigation from the authenticated account. `admin-records.tsx` handles users/jobs/audit lists; `admin-metrics.tsx` handles reporting. Candidate, hiring, interview, team and notification workspaces are named after their workflows. Company approval UI remains in `dashboard.tsx`.

`src/lib/api.ts` handles browser requests. Hiring and interview-time helpers re-export the browser-safe shared workspace. `src/app/globals.css` contains the existing responsive theme and layouts; the structural refactor does not change styling.

Use root `npm run dev:web`, `npm run build`, and `npm run typecheck`. For direct commands in this folder, install at root and build shared first. Web environment: `API_URL`, `APP_URL`, `MAIL_MODE` (development recovery hint). Never put database, JWT or S3 secrets here.
