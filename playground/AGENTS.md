# gaas-playground

Instructions for AI coding agents working in this repository.

<!-- evlog:start -->
## Logging

This project uses [evlog](https://evlog.dev) for structured, request-scoped logging. The authoritative conventions — which surface uses which logger, what context to attach, and how to handle errors — live in [`../docs/LOGGING-SPEC.md`](../docs/LOGGING-SPEC.md). Read that document before adding or changing logging.

Quick orientation:
- **Server API routes** use `const log = useLogger(event)` (auto-imported from `evlog`).
- **Client composables and components** use the `log` symbol from `evlog/client` (auto-imported in Nuxt layers; otherwise `import { log } from 'evlog/client'`).
- **Nuxt module lifecycle and build-time diagnostics** use `@nuxt/kit`'s `logger.withTag(...)`.
- **Standalone scripts and scheduled tasks** with no HTTP event use `initLogger` or `createRequestLogger` from `evlog`.
- **Effect programs** use `Effect.log*` / `Effect.logInfo` / `Effect.logError`; these are routed to evlog by the `runGalaxyEffect` / `runTaskEffect` helpers.

**Never log secrets** — passwords, tokens, API keys such as `GALAXY_API_KEY` and Supabase service keys, full card numbers, session JWTs, or user tokens. Redaction is enabled in production, but choosing safe fields is the first line of defense.
<!-- evlog:end -->
