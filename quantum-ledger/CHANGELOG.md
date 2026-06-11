# Changelog

All notable changes to Quantum Ledger will be documented here.

## [1.1.0] — 2026-06-11

### Added
- Blueprint catalogue: track discovered blueprints, searchable and filterable by source and type, with default/ship-matrix lookups
- Clan/org sync (optional): push session activity, blueprint discoveries, and your hangar to a self-hosted [Quantum Org Server](../quantum-org-server/) in real time
- Settings → Clan sync: configure the org server URL, Server ID, and Auth Token, with a connection test before saving
- Linux desktop builds (AppImage + .deb) added to the rolling release alongside Windows

### Changed
- Rebranded from Star Citizen Ledger to **Quantum Ledger**
- The companion clan/org server was renamed `clan-data-server` → `quantum-org-server` and now ships a Docker image

### Security
- The local API now requires a custom header on all non-health requests, blocking blind cross-site (CSRF-style) requests from a malicious webpage
- Added a Content-Security-Policy header to the local API responses
- The clan/org Auth Token is no longer returned in plaintext by `GET /api/settings` — only whether one is set; saving settings with a blank token keeps the existing one
- Electron: external links are only opened in the system browser if they use `http(s)`; other URL schemes are blocked

## [1.0.1] — 2026-06-04

### Added
- Salvage refining pipeline: queue salvage hauls into refinery sessions alongside mining ore
- Inventory fixes and refinements across mining, refining, and crafting

## [1.0.0] — 2026-05-30

### Added
- Standalone Refining page with session queuing, timers, and inline editing
- Mining bag system, standalone crafting page, committed ore inventory, and run editing
- Linux and macOS build support (AppImage, .deb, dmg)

### Changed
- Rebranded to **Star Citizen Ledger**
- Refining view groups ore by material × quality with collapsible sections

### Security
- Hardened server error handling, disabled source maps, added a shared `routeError` helper

## [0.1.0] — 2026-05-22

### Added
- Mining pipeline: raw ore → refinery job → refined output → sale with full cost tracking
- Trading runs: buy/sell entries with commodity, quantity, margin, and status tracking
- Crafting jobs: output item, material inputs, cost basis, estimated value
- Contracts: combat, hauling, escort, refueling missions with payout and bonus tracking
- Multi-crew: per-run crew list with fixed-fee or percentage payout allocation and settlement tracking
- Vehicle/ship tracking per run
- Run timing: start/end timestamps with profit-per-hour calculation
- Expenses: itemised investments and costs (fuel, repairs, equipment, etc.) tied to runs or standalone
- Inventory: stock levels with average cost basis and in/out transaction history
- Full accounting ledger: income, expenses, crew payouts, net profit per game
- Dashboard: profit summaries, recent runs, run-type breakdown
- Multi-game support with separate currencies (Star Citizen/UEC, EVE Online/ISK, Elite Dangerous/Credits)
- Settings page: manage games and currency labels
- 100% offline — all data stored in a local SQLite file at `%APPDATA%\Quantum Ledger\data\`
- Windows installer (NSIS) and portable executable via electron-builder
