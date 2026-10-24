# Canonical API and architecture

The browser uses same-origin `/api`. Standard Node mode proxies Next requests to Express via API_URL; the prepared Vercel Services profile routes `/api` directly to the same Express app. JSON responses use named objects/lists; errors are `{error:{message}}`. IDs are MongoDB ObjectIds, not course UUIDs. Bodies reject unknown keys where validators declare strict schemas.

Authentication uses HTTP-only `crewup_access`/`crewup_refresh` cookies. The web helper refreshes once on 401. Never store access tokens in browser localStorage. Mutable review/interview/member requests include the displayed version and return 409 for stale data. Use returned `nextCursor` unchanged for the next page.

| API prefix | Contract |
|---|---|
| `/auth` | POST register/login/verify/resend/refresh/logout/forgot-password/reset-password; GET me/development-mail. Local mail preview is authenticated and disabled in production. |
| `/workspace` | GET workspace; POST company/projects/jobs; PATCH projects/:id, jobs/:id, jobs/:id/status. |
| `/team` | GET members/invitations; POST invitations and accept; PATCH members/:id with role/version; DELETE members/:id or invitations/:id. Accept requires signed-in verified recruiter matching invitation email. |
| `/public/jobs` | GET q, searchMode=literal/keywords, location, employmentType, workMode, currency, minBudget, category, limit, cursor. Returns jobs and nextCursor. |
| `/candidate` | Profile, shortlist, upload initialization/content/confirmation, batch applications and withdrawal. See strict schemas in server/src/candidate.ts and shared/src/hiring.ts for required snapshot/version fields. |
| `/hiring` | Company-scoped application list/filter/cursor, private notes and stage updates; aggregate readiness. Hiring managers have read-only access. |
| `/interviews` | GET scoped list/cursor/status; POST scheduling; PATCH :id reschedule, :id/cancel, :id/feedback; GET :id/calendar. |
| `/notifications` | GET cursor/unread count; PATCH read-all or :id/read, scoped to recipient. |
| `/files/resumes/:id` | GET only owner or authorized recipient company; local bytes or short-lived private S3 redirect. |
| `/admin` | GET company queue/statistics; PATCH companies/:id/status. GET metrics and records/users, records/jobs, records/audit with q/cursor. PATCH users/:id/status and jobs/:id/moderation require reason. Administrator accounts cannot be suspended through this UI. |
| `/health`, `/ready` | API liveness and MongoDB/Redis readiness; no credentials in output. |

## Data and consistency decisions

Mongo transactions protect multi-role applications, scheduling/stage changes, feedback, invitations and moderation. Unique indexes enforce one membership per user, one application per applicant/job, one scheduled interview per application, and one digest per recipient/company/day. Queue writes use the same Mongo transaction as application notifications, avoiding a database/Redis dual-write loss. BullMQ periodically drains this durable outbox. Email acknowledgement cannot be exactly once across SMTP/network crashes.

PDF confirmation stores a fresh immutable private key and validates size/pages/content. Background text extraction stores counts, not parsed CV text or a hiring score. Existing submitted evidence is never rewritten when profiles or job descriptions change.

The worker supports local polling for offline demo convenience and BullMQ/Redis in production. Redis caching stores only public job IDs; every cache hit rechecks current job/company/project visibility and returns current records. Cache failures fall back to Mongo. Rate limiting fails closed when its configured Redis store is unavailable.

## Role policy

Applicant: own profile/CVs/saved roles/applications/interviews. Recruiter: one company membership. Owner and HR/recruiter can manage hiring; hiring manager can read. Owner alone can invite or change/remove staff; HR can list staff. Admin manages platform records but does not gain unrestricted candidate CV download access.

## Running proof

`npm test` uses an isolated database and files. `npm run test:redis` needs a real dedicated Redis endpoint and starts a separate worker with a unique queue prefix. `.github/workflows/verify.yml` describes the Linux service-based check. Neither the workflow nor deployment is automatically triggered from this workspace.
