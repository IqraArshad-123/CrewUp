# Backend — Express

## Source map

| File(s) in src/ | Responsibility |
| --- | --- |
| `index.ts`, `app.ts` | HTTP startup and API/router assembly |
| `vercel.ts` | Request-driven adapter without starting a listener |
| `config.ts` | Validated private environment settings |
| `auth.ts`, `shared.ts` | Accounts, sessions, authentication and permissions |
| `models.ts`, `hiring-models.ts`, `day3-models.ts` | MongoDB/Mongoose schemas |
| `workspace.ts`, `hiring.ts`, `public-board.ts` | Company/project/job and recruiting workflows |
| `candidate.ts`, `storage.ts` | Applicant profile and private CV access |
| `team.ts`, `interviews.ts`, `notifications.ts` | Team invitations, interviews and notifications |
| `admin.ts` | Admin records, metrics, moderation and audit history |
| `worker.ts`, `background.ts`, `mailer.ts` | Email outbox, CV processing, cleanup and digests |
| `infrastructure.ts` | Redis, queues, caching and logging |

`scripts/` holds operational tools. Atlas/CV migration scripts are historical one-time tools; do not rerun them against an already migrated database. `tests/` holds behavioral integration tests, including permission boundaries. `dist/` is generated, not source.

Use commands from root README. Compiled entrypoints are `server/dist/src/index.js`, `server/dist/src/worker.js`, and `server/dist/scripts/preflight.js`; run them with **server as working directory**. Production providers should inject environment variables. Development loads `server/.env.local` relative to the server working directory.

Admin uses the regular authentication system with the `admin` account role. `admin.ts` applies `auth` and `role("admin")` middleware. Additional admin company routes live in `workspace.ts`. Public registration must not grant platform admin privileges. Tenant membership checks also protect company data.

Database and private CV storage stay online (Atlas and S3/Tigris). `.data/` is ignored and retains old migration backups plus development mail previews; do not publish it. The `db:test` tool creates a disposable MongoDB replica set exclusively for test execution and is not used by the app launcher.
