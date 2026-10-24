> CV UPDATE: Existing and new CVs now use private Tigris cloud storage; live upload/download and restricted-origin checks passed. See CV_CLOUD_STATUS.md. Earlier pending CV-storage notes below are historical.

> UPDATE — 24 October 2026: CrewUp now uses MongoDB Atlas. All 15 collections were copied and compared with the source; the API and worker were restarted with Atlas. Local MongoDB was stopped and npm run dev no longer starts it or falls back to it. Older local-database instructions below are historical. Configure a private Atlas MONGODB_URI before starting. CV binaries, local email previews and worker execution have NOT yet moved to cloud services. Website deployment remains on hold. The original database files are retained as a migration backup.

# Deployment preparation — do not publish yet

The user explicitly asked to wait for permission before deployment. No Vercel project, public deployment, account, domain or paid resource has been created. This guide describes prepared paths, not completed deployments.

## Portable architecture

CrewUp has three runnable processes: Next.js web, Express API and a separate background worker. MongoDB must support transactions (replica set). Redis supplies production queues, shared rate limiting and public-board caching. Private PDF storage can be a durable local volume on a conventional server, or an S3-compatible bucket. SMTP supplies real email. These interfaces avoid a provider-specific database or storage dependency.

Local demo: `npm ci`, `npm run dev`, optionally `npm run seed`. The launcher starts MongoDB, API, web and a local polling worker. No real email is sent in local mode. Existing demo data remains private under `.data`. All-in-one development startup is for one machine, not a public server.

## Vercel profile (prepared, not deployed)

`vercel.example.json` defines web/API Services and a BullMQ worker Daemon, using `server/vercel.ts` and `Dockerfile.worker`. The JSON passed Vercel's published schema validation on 24 October 2026. The full cloud build/runtime has not been executed. Keep it named `.example` until deployment is authorized; then review account capabilities/quotas, copy it to `vercel.json`, and run the platform build checks before publishing.

The API adapter initializes MongoDB once per warm instance and does not start an HTTP listener. The service route sends `/api/*` to Express while pages go to Next.js. Browser cookies remain on the same origin. The worker retains all background tasks. This uses Vercel Services/Daemons beta capabilities: verify availability and plan quotas on the actual account. Daemons currently run in production, not preview; preview background jobs need an explicitly configured separate worker. No claim of unlimited or cost-free execution is made.

Required environment: exact HTTPS `APP_URL`, `MONGODB_URI`, random `JWT_SECRET`, `REDIS_URL`, `MAIL_MODE=smtp`, SMTP settings, and `FILE_STORAGE=s3` plus private bucket credentials/region/endpoint. Set `QUEUE_PREFIX` uniquely per environment; use separate databases and buckets for preview versus production. Never share production workers with preview databases. API_URL is unnecessary with the Services route; for the alternative split deployment below, it is required.

Cloud PDFs upload directly to a private bucket and download through a 60-second signed URL issued only after authorization. Configure bucket CORS for PUT and GET from the exact web origin. This avoids routing the PDF body through web functions. Confirmation still validates the retained PDF. Signed-link generation and access checks were tested locally; a real bucket has not been exercised. Add a lifecycle policy for the temporary `tmp/` prefix. Do not use an ephemeral cloud filesystem for confirmed CVs.

Sources checked: [Services](https://vercel.com/docs/services), [configuration](https://vercel.com/docs/services/config-reference), [Daemons](https://vercel.com/docs/daemons), [Express](https://vercel.com/docs/frameworks/backend/express). These are platform-dependent interfaces; recheck when deployment is authorized.

## Conventional Node/Docker profile

Copy `.env.example` to a private `.env.production` and supply MongoDB replica-set, SMTP, HTTPS app origin and secret settings. Compose supplies internal Redis with a persistent volume. Use a clean database and provision an admin deliberately; never seed demo credentials into production.

After authorization, on a host with Docker:

```sh
docker compose --env-file .env.production -f compose.production.yml build
docker compose --env-file .env.production -f compose.production.yml up -d
```

The web port is loopback-only at 3000; put an HTTPS reverse proxy in front. API/Redis have no published host ports. Back up MongoDB and private-files/Redis volumes and test restoration. Redis uses noeviction for BullMQ. The API and worker must use the same MongoDB URI, storage configuration and queue namespace. Docker is absent from the current machine, so these images/Compose have not been executed here.

Without Docker: `npm ci`, `npm run build:api`, `npm run build`; supervise `npm run start:api`, `npm run start:web`, `npm run start:worker`. Supply production environment variables through the process manager; `.env.production` is not automatically read by the processes. Set API_HOST for your network topology. Keep API/DB access restricted.

Vercel web can also point `API_URL` at a separately hosted HTTPS Express API while the worker runs on any Node/container host. The same application code and API paths apply.

## Verification and operations

- `npm run preflight` checks configuration only. Runtime images use `node dist/scripts/preflight.js`.
- `npm test` exercises an isolated local MongoDB test database. `npm run test:redis` requires `REDIS_INTEGRATION_URL`; it is skipped if unset. It uses a unique BullMQ namespace and tests a real separate worker, cache visibility and shared rate limiting. This real-Redis suite has not run on this Windows machine.
- `.github/workflows/verify.yml` prepares MongoDB/Redis and runs tests/builds/Docker on Linux. The workflow has not run remotely; code has not been pushed.
- The worker schedules mail outbox delivery, PDF text summaries, hourly cleanup and daily recruiter digests. Digests use a stable recipient/company/day key. Mail delivery is at least once; a crash after sending can produce a duplicate email. Failed mail stops after five attempts. Sent payloads are removed and sent jobs expire after seven days.
- Structured request logs exclude bodies, cookies, query strings, passwords and message payloads. `/health` is liveness; `/ready` checks MongoDB and configured Redis. Monitor worker logs and failed-email counts on the admin overview.
- Rate limiting is shared when Redis is configured. Configure `TRUST_PROXY_HOPS` only for a known proxy chain. The ingress must overwrite client-supplied forwarding headers, and the API must not be reachable through a shorter untrusted path. The default is zero trusted hops.
- `npm run maintenance` previews local temporary PDFs older than 24 hours; `-- --apply` removes them. Confirmed CVs are untouched. The worker invokes the cleanup automatically. S3 requires the bucket lifecycle rule.
- Before accepting real public applicant data: verify SMTP sender/DNS, bucket access, HTTPS, backup restoration, dependency connectivity and end-to-end upload/application/interview flows. Malware scanning/quarantine and an explicit personal-data retention/deletion policy remain additional public-release hardening. PDF structure/page/size validation is not antivirus scanning.
