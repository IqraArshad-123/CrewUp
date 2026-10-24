# CV cloud storage — verified 24 October 2026

- Existing CV migrated and compared byte-for-byte; its Atlas record uses S3 storage.
- New uploads now use FILE_STORAGE=s3 and go directly to the private Tigris bucket.
- End-to-end live API test passed: create upload, signed PUT, confirmation, private signed download, matching bytes, and anonymous 403.
- Both preview origins passed strict browser CORS preflight checks. Unrelated origin returned 403 with no allow-origin header.
- Tigris uses virtual-hosted bucket URLs; generic path-style endpoints returned wildcard CORS and are no longer used for Tigris.
- TypeScript check and API build passed. API and worker restarted.
- Two fictional cloud verification CV versions are retained in the demo applicant account. Existing selected CV was not changed.
- Original local CV remains as migration backup, not active storage. Temporary credential files are excluded from Git/archives.
- Add the exact live HTTPS website origin to bucket CORS at deployment and repeat upload/download checks there. Website remains undeployed.
- Email and background worker cloud deployment remain separate pending tasks.
