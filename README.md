# Star Citizen Ledger

> A free, offline desktop app for tracking your Star Citizen economy — hauling contracts, mining runs, trading, refining, salvage, crew payouts and more. All data stays on your machine. No accounts, no cloud, no internet required.

---

## Features

| Module | What it tracks |
|---|---|
| **Runs** | Session containers — group all activity under a single run |
| **Hauling** | Multi-leg contracts with per-leg SCU × qty, pickup → drop-off, individual leg completion |
| **Mining** | Ore bags, per-ore quality lines, check-in at stations |
| **Refining** | Session queuing with timers, actual vs expected yield, auto-adds output to inventory on completion |
| **Salvaging** | Haul tracking, commit hauls to stations |
| **Trading** | Buy by boxes × SCU, cost tracking, auto-adds to inventory until sold |
| **Crafting** | Job + input materials, optional inventory deduction |
| **Contracts** | Client contracts with agreed payout and crew splits |
| **Inventory** | Unified view of everything you own — auto-populated from all modules |
| **Accounting** | Full ledger, run P&L reports, expense tracking |
| **Crew** | Members, roles, payout percentages, earnings history |
| **Vehicles** | Fleet management |

---

## Download

Head to [**Releases**](https://github.com/Axiomancer/star-citizen-ledger/releases) and grab the latest:

| File | Description |
|---|---|
| `Star Citizen Ledger-1.0.0-Setup-x64.exe` | Windows installer — adds Start Menu shortcut + Desktop icon |
| `Star Citizen Ledger-1.0.0-Portable-x64.exe` | Single executable, no installation needed |

> Your data lives in `%APPDATA%\star-citizen-ledger\data\` on your machine and is preserved across app updates. Nothing is stored inside the executable.

### Virus scan results (v1.0.0)

Both files have been scanned and are clean. Windows Defender and other tools may flag unsigned Electron apps as "unknown publisher" — this is expected for indie apps without a code-signing certificate and is not a virus.

| File | VirusTotal |
|---|---|
| `Star Citizen Ledger-1.0.0-Setup-x64.exe` | [View scan results](https://www.virustotal.com/gui/file-analysis/OTMwNDE5OWM5MDRmZTdjOTg2NWM5NDU5OTliMTIxNDk6MTc4MDE3Njc0Nw==) |
| `Star Citizen Ledger-1.0.0-Portable-x64.exe` | [View scan results](https://www.virustotal.com/gui/file-analysis/ZTU4OGY3NTRiMjQ3MWJlYTJiNTBhOGNlMDMyNDQxMjQ6MTc4MDE3NjcxOQ==) |

---

## Building from source

### Prerequisites

- [Node.js](https://nodejs.org/) 20+

### Install

```bash
npm install
cd client && npm install && cd ..
cd server && npm install && cd ..
```

### Run in development

```bash
# Terminal 1 — API server
npm run dev:server

# Terminal 2 — Vite dev client
npm run dev:client

# Terminal 3 — Electron shell (connects to Vite automatically)
cd electron && npm install && npm start
```

### Build the installer

```bash
npm run package
```

Output lands in `release/`. The pipeline:
1. Generates `electron/build-assets/icon.png` from the SVG logo
2. Compiles the TypeScript server (`server/dist/`)
3. Builds the React client with Vite (`client/dist/`)
4. Copies everything into the Electron shell
5. Runs `electron-builder` → produces `*-Setup-x64.exe` + `*-Portable-x64.exe`

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, TailwindCSS, TanStack Query |
| Backend | Express, libSQL / SQLite via `@libsql/client` |
| Desktop | Electron 42 |
| Packaging | electron-builder (NSIS for Windows) |

---

## Contributing

Issues and PRs welcome. The project is a monorepo:

```
client/   React + Vite frontend
server/   Express + SQLite backend
electron/ Electron shell + build config
scripts/  Build helpers (icon generation, prepare-electron)
```

---

## License

MIT — free to use, modify, and distribute.

---

*Not affiliated with Cloud Imperium Games or the Star Citizen project.*
