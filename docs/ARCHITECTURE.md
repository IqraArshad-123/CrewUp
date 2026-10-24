# Architecture and reviewer guide

```text
Browser → Next.js client → same-origin /api proxy → Express server
                                                   ├─ MongoDB Atlas
                                                   ├─ private S3/Tigris CVs
                                                   └─ Redis (production)
Background worker → same database/storage + SMTP/Redis
```

1. `client/src/app` defines routes. `client/src/components/dashboard.tsx` chooses role-specific screens after loading the signed-in account.
2. `server/src/app.ts` assembles routes. `auth.ts` and `shared.ts` validate sessions/roles. Backend checks remain mandatory regardless of what UI is visible.
3. Mongoose models persist companies, projects, jobs, applications and related records in Atlas. CV metadata is in MongoDB; file contents are private object storage.
4. Authorized API requests issue short-lived signed CV upload/download URLs. Browser uploads go directly to the private bucket; backend confirmation validates the PDF. CORS must include the exact deployed frontend origin.
5. `worker.ts` runs background mail, PDF processing, cleanup and recruiter digests. Moving folders does not replace this process with request handlers.
6. `shared/src` keeps hiring stages, size limits and timezone functions consistent. Its compiled package is built before dependent workspaces.

The frontend and backend each have their own manifest and TypeScript configuration, with a single root npm lockfile. Root commands set each service's working directory through npm workspaces. Backend secrets do not flow into the frontend launcher environment.

## Refactor scope

Source files, imports, build paths, startup commands and deployment templates were reorganized. Application routes, schemas, permission rules and UI workflows were retained. Current verification results are recorded in STRUCTURE_VERIFICATION.md.
