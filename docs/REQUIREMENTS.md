# Course-to-CrewUp verification matrix

Source: the downloaded 277-document course snapshot recorded in `../repo-review.md`. This is a product/engineering mapping, not a claim that educational quizzes or PostgreSQL-specific exercises have been completed. MongoDB was explicitly requested by the user. Public deployment is on hold at the user's request.

| Course area | CrewUp implementation | Evidence / boundary |
|---|---|---|
| 01–16 scope, stack, models, validation | Next.js/TypeScript, Express, MongoDB/Mongoose; users, companies, members, projects, jobs, applications, interviews | Compiles; integration fixtures exercise validation and transactions. Mongo ObjectIds replace UUIDs/SQL relations. |
| 17–30 auth and panels | Password hashing, verification, short-lived cookie JWTs, rotating refresh sessions, logout, roles; reset and session revocation | Auth/ownership/replay/reset integration tests; responsive role panels. |
| 31–35 company staff | Company onboarding, owner-only invitations/role changes/removal, HR member listing, protected owner, expiring hashed single-use invitations | Team integration test covers concurrent acceptance, wrong email, expiry, stale version, owner protection and removed access. Invitees sign in/register and verify first, rather than creating a password in the invitation endpoint. |
| 36–38 jobs | Create/edit drafts, publish/close, company approval, moderation holds | Tenant/publishing/moderation tests. |
| 39–45 public board | Joined MongoDB aggregation; bounded cursor pages; literal or indexed Mongo text search; location/type/mode/currency/budget filters; Redis ID cache and invalidation | 65-role pagination, literal/keyword/filter and moderation tests. Cache rechecks current visibility/data before returning results. Real Redis cache execution still needs the Redis suite. Mongo text index replaces PostgreSQL GIN/tsvector; ID order replaces SQL tuple cursors. |
| 46–48 profiles/CVs | Skills, portfolio, availability; private versioned PDF upload, immutable retained keys, authenticated download; direct S3 signed download | Ownership/content/page/size/concurrency tests and signed-link test. Local storage verified; live S3 remains unverified. |
| 49–54 shortlist/apply | Cross-company shortlist, per-role answers/cover letters, batch transaction, immutable candidate/CV/job/project/question snapshots, duplicate prevention | Day 2 tests cover duplicate submission, rollback, snapshots and withdrawal. One application per candidate/job including after withdrawal. |
| 55–58 hiring | Forward-only pipeline, private notes, scoped tracking, interviews/timezones/conflicts, calendar export, one-time feedback, terminal decisions | Day 2/3 tests; browser interview reschedule/notification walkthrough. |
| 59–61 admin | Company approval/suspension with interview cancellation, user suspension/reactivation with session revocation, job moderation holds, metrics, simple action history | Moderation/auth tests; admin screens. Advanced impersonation/manual data editing is out of course scope. |
| 62–69 background work | Separate BullMQ worker; durable Mongo outbox; local polling fallback; confirmations/alerts; real PDF text word/page counts; scheduled cleanup; daily digests | Outbox retry and background-handler tests pass. Real Redis worker suite + CI recipe supplied but not executed locally. Processing is scheduled in small batches; payloads remain in Mongo instead of Redis. |
| 70–73 operations | Shared Redis rate-limit store, structured request IDs/logs, health/readiness, security headers, graceful process shutdown | Local build/API checks; Redis store test prepared. Production proxy topology must be verified. |
| 74 deployment | Portable Docker/Node processes, Vercel request adapter and Services/Daemon configuration, environment/preflight docs | API and Next production builds pass; Vercel schema passes. No Docker/cloud deployment executed. |
| 99 final end-to-end | Automated test scenarios and local UI evidence; API_CONTRACT.md documents canonical paths | Local evidence is recorded below; real Redis, provider, Docker/cloud and deployment proof remain pending. Do not label chapter 99 fully passed. |
| CrewUp differentiator | Project-based role coverage plus hired candidates' declared availability across current project dates | Team readiness; no automatic hiring decision. Missing dates require human confirmation. |

## Intentional boundaries

The course excludes payments, live chat/websockets and a native mobile app. CrewUp is a responsive web application. PostgreSQL SQL migrations/EXPLAIN exercises need Mongo equivalents, not verbatim compliance. Tests and query indexes do not establish production load-test results. Learning-log answers belong to the learner; this implementation does not fabricate them.

Candidate CV selection currently lists the latest 20 versions; applications/notifications/interviews and admin record lists have bounded cursor pages. Member and company workspace lists are intended for small teams; large-scale pagination/load testing is not established. Full public-release retention tooling and malware scanning are additional hardening, not implemented features.

## Verification record

Current evidence is in COMPLETION_STATUS.md. No external checks are silently treated as passed. Deployment remains explicitly deferred until the user asks.
