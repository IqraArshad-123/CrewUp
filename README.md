# CrewUp

Project-based hiring: companies create projects, publish the roles they need, review candidates and coordinate interviews. Applicants maintain profiles and private CVs. Platform admins approve companies and moderate accounts/jobs.

## Repository map

```text
crewup/
  client/                 Next.js frontend (React + TypeScript)
    src/app/              Pages, layouts and same-origin API proxy
    src/components/       Dashboard, admin, applicant and recruiter screens
    src/lib/              Browser API helper and shared-rule imports
    package.json          Frontend dependencies and commands
    tsconfig.json
    next.config.mjs
    .env.example          Web settings only
  server/                 Express backend (Node.js + TypeScript)
    src/                  Routes, authentication, models, storage and worker
    scripts/              Seed, maintenance and migration tools
    tests/                Integration and Redis tests
    package.json          Backend dependencies and commands
    tsconfig.json         Type checking
    tsconfig.build.json   Production compilation
    .env.example          Database/storage/email configuration template
  shared/                 Small, browser-safe TypeScript workspace
    src/hiring.ts         Hiring stages and CV size limit
    src/interview-time.ts Timezone conversion shared with tests
  docs/                   Requirements, API contract, deployment and status
  scripts/dev.mjs         Starts web, API and worker after checking Atlas
  package.json            Workspace commands
  package-lock.json       One reproducible lockfile for all workspaces
  Dockerfile              Web/API container build
  Dockerfile.worker       Background worker container build
```

The two application folders are **client** and **server**. `shared` holds common rules so frontend/backend cannot silently disagree. npm workspaces may install dependencies in root `node_modules`; this does not mix application source. Run installation at the repository root, not separately in each folder.

## Start development

Use Node.js 24 and npm. Copy `client/.env.example` to `client/.env.local` and `server/.env.example` to `server/.env.local`, then supply your private Atlas and storage settings. Existing configured installations already have these ignored files. Never commit credentials.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3000. The launcher checks MongoDB Atlas and starts Next.js, Express and the development worker. It never starts a local application database. Database records use Atlas; CVs use private Tigris/S3 storage. Development email previews and the running web/API/worker processes are still on the development machine until deployment is authorized.

## Commands (repository root)

| Command | Purpose |
| --- | --- |
| `npm run dev` | Web + API + worker |
| `npm run dev:web` / `npm run dev:api` | Start one development service |
| `npm run worker` | Start development worker |
| `npm run typecheck` | Check frontend and backend TypeScript |
| `npm run build` | Production frontend build |
| `npm run build:api` | Compile production backend |
| `npm test` | Integration tests against isolated test MongoDB on port 27018 |
| `npm run test:redis` | Additional tests when REDIS_INTEGRATION_URL is set |
| `npm run start:web` / `npm run start:api` / `npm run start:worker` | Run built services |
| `npm run preflight` | Check service configuration |

Root development/build/test commands compile `shared` first. If running workspace commands directly, run `npm run build:shared` first. CI provisions disposable test databases; tests never target the configured Atlas database.

## Admin setup

Admin uses the same sign-in page and `/dashboard` route. The authenticated role selects admin screens. `client/src/components/admin-metrics.tsx` and `admin-records.tsx` render reports and records; `dashboard.tsx` includes company approvals. Backend enforcement is in `server/src/admin.ts`, `workspace.ts` and `shared.ts`. Admin APIs require an authenticated admin on the server; hiding UI is not the permission boundary. Recruiter and applicant accounts cannot use these routes.

Demo seed accounts are development-only; `npm run seed` is optional and must not be used for public production accounts. Never expose private environment files or retained migration backups under `server/.data`.

## Review guide

Start with [architecture](docs/ARCHITECTURE.md), then [frontend](client/README.md), [backend](server/README.md), [API contract](docs/API_CONTRACT.md) and [requirements](docs/REQUIREMENTS.md). [Deployment](docs/DEPLOYMENT.md) describes pending infrastructure and prepared runtime paths. Day-by-day documents are historical progress records.

GitHub push and deployment are on hold. SMTP and production Redis/worker setup still require configuration and live verification.
