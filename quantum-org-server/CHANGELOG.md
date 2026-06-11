# Changelog

All notable changes to Quantum Org Server will be documented here.

## [1.1.0] — 2026-06-11

### Added
- Initial release as **Quantum Org Server** (renamed from `clan-data-server`)
- Activity feed, blueprint index, and aggregated hangar overview across approved members
- Leaderboards ranked by sessions, payout, or activity within a configurable time window
- Org statistics by week/month/all-time, refreshed by a background `aggregateStats` job
- Member approval workflow (`pending` → `approved`/`rejected`)
- Browser-based admin dashboard for members, ships, blueprints, activity, and settings
- Configurable org name shown in the dashboard header and browser title
- Daily `cleanupOldData` job to prune sessions/activity past `DATA_RETENTION_DAYS`
- Docker image (published to GHCR on every push to `main`) and Docker Compose setup for VPS deployment
- Standalone Windows `.exe` build via `@yao-pkg/pkg`

### Security
- `AUTH_TOKEN` is no longer printed to the console on every boot — only once, when first generated
- Auth token comparison uses `crypto.timingSafeEqual` for constant-time checking
- Removed the permissive app-wide CORS middleware (the admin API doesn't need it)
- Parameterized previously string-interpolated SQL in the members, leaderboard, and stats-aggregation routes
- Docker image now runs as a non-root user
