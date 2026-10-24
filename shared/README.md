# Shared rules

Small TypeScript workspace imported by both applications. It contains no network clients, environment settings, credentials or database models. `npm run build:shared` emits JavaScript and declarations to ignored `dist/`. Root build/dev/test commands run this automatically.
