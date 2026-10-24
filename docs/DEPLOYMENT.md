# Deployment preparation (not deployed)

Deployment and GitHub push remain on hold. Atlas database and private Tigris CV storage are configured. Production SMTP, Redis, worker hosting, final app origin/CORS and end-to-end cloud verification remain pending.

## Workspace build

Use Node.js 24. Install at repository root with `npm ci`, then run `npm run build:api` and `npm run build`. These compile the shared package automatically. Start built services using root `start:web`, `start:api`, `start:worker` npm scripts. They select the correct working directories.

The frontend root is `client`; backend root is `server`. Backend Express adapter: `server/src/vercel.ts`. Compiled persistent-server entrypoints: `server/dist/src/index.js` and `server/dist/src/worker.js`. Shared package source and root lockfile must be included in any deployment build context. Do not upload client or server alone without their workspace dependencies.

## Vercel preparation

`vercel.example.json` is an inactive example for web/API Services and a worker Daemon. Folder references have been updated; this reorganized template has not been deployed or validated by a Vercel build. Before enabling it, verify provider schema/account feature availability, workspace inclusion outside each service root and build commands. Keep it named `.example` until authorized.

Alternatively deploy Next.js with project root `client`, enable access to workspace files outside its root, install dependencies at repository root and build shared before Next.js. Set `API_URL` to the separately hosted HTTPS Express API. The frontend proxy preserves same-origin browser cookies. A separate persistent worker remains required. Do not omit background features to fit a deployment target.

## Secrets and services

Backend: `MONGODB_URI`, `JWT_SECRET`, `APP_URL`, `REDIS_URL`, SMTP settings with `MAIL_MODE=smtp`, and private S3 settings with `FILE_STORAGE=s3`. Frontend: `API_URL`, `APP_URL`; no database/storage secrets. Use provider environment settings in production. `.env.production` is not automatically read by Express; inject it through the provider/process manager or Compose.

Add the exact deployed web origin to private bucket CORS. Keep signed URLs and private bucket access. Use separate databases, queue namespaces and buckets for preview/production. Configure temporary-upload lifecycle cleanup in the bucket. Do not seed public deployments with demo credentials.

## Docker preparation

Both Dockerfiles use repository-root build context and preserve all three workspaces. Compose reads `server/.env.production`, supplied privately; run `docker compose --env-file server/.env.production -f compose.production.yml build` when deployment is authorized. Web exposes loopback port 3000; put HTTPS ingress in front. Compose provisions Redis internally. Docker is not installed here, so images/Compose have not been executed locally.

Production checks: HTTPS, SMTP sender/delivery, Redis queues and rate limits, worker execution, CV upload/download, account roles, backup restoration and health monitoring. `/health` is liveness; `/ready` checks dependencies. Real Redis tests need REDIS_INTEGRATION_URL. The configured GitHub workflow has not run remotely.

Earlier deployment notes are retained under archive/ for history, not current setup instructions.
