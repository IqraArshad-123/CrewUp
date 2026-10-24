> CV UPDATE: Existing and new CVs now use private Tigris cloud storage; live upload/download and restricted-origin checks passed. See CV_CLOUD_STATUS.md. Earlier pending CV-storage notes below are historical.

> UPDATE — 24 October 2026: CrewUp now uses MongoDB Atlas. All 15 collections were copied and compared with the source; the API and worker were restarted with Atlas. Local MongoDB was stopped and npm run dev no longer starts it or falls back to it. Older local-database instructions below are historical. Configure a private Atlas MONGODB_URI before starting. CV binaries, local email previews and worker execution have NOT yet moved to cloud services. Website deployment remains on hold. The original database files are retained as a migration backup.

# Current verification — 24 October 2026

Deployment is on hold at the user's request. Nothing has been publicly deployed.

## Verified locally

- All 16 integration tests passed against an isolated MongoDB replica-set test database.
- TypeScript check, Next.js production build and compiled Express API build passed.
- Tests cover authentication, tenant isolation, hiring, private CVs, interviews, recovery, team invitations, moderation, filtered pagination, PDF processing, digests, signed download authorization and the request-driven API adapter.
- Desktop and mobile interview/team screens and desktop moderation were inspected in the browser. The narrow team invitation form was corrected.
- Vercel example configuration passed the published JSON schema. This is configuration validation, not a cloud deployment test.
- Day 3 demo video: ../CrewUp-Day3-Demo.mp4, 1:54, captioned actual application screenshots, no voiceover. It precedes the follow-up features.

## Added after Day 3

Team invitations and member permissions; user/job moderation with audit history; admin metrics; filtered and paginated public search; project date coverage; separate background worker; PDF processing; recruiter digests and cleanup; Redis/BullMQ integration; shared rate limiting/cache adapters; private cloud download links; Node/Docker and Vercel deployment preparation.

## Still requires environment verification

- Real Redis/BullMQ integration: a separate test and CI workflow are provided, but Redis is unavailable on this machine, so that suite has not run.
- Docker images/Compose: not executed because Docker is unavailable here.
- Actual SMTP delivery, private S3 bucket operations/CORS, and a Vercel build/runtime: not exercised against live providers.
- Production load/query-plan, backup restoration and real-data retention/scanning checks are not complete.

These limits must not be described as fully verified production readiness or complete acceptance of every course chapter. REQUIREMENTS.md maps implemented scope and adaptations; DEPLOYMENT.md contains the pending platform checks. Local demo data and credentials are excluded from the source ZIP.
