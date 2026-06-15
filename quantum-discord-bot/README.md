# Quantum Discord Bot

A small Discord bot that posts org activity stats from a self-hosted [Quantum Org Server](../quantum-org-server/) as rich embeds. Each org runs its own copy of this bot alongside their org server — there's no shared/central bot.

---

## Commands

| Command | Description |
|---|---|
| `/stats [period]` | Org-wide activity summary (sessions logged, active members, activity breakdown). `period` is `today`, `week` (default), `month`, or `all_time`. |
| `/fleet` | List every ship type available across the org's hangars, with counts and SCU capacity. |
| `/help` | List all available commands and what they do. |

---

## Setup

### 1. Create a Discord application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. **Bot** tab → **Reset Token** → copy it. This is `DISCORD_BOT_TOKEN`.
3. **OAuth2 → URL Generator** → check scopes `bot` and `applications.commands`, and permissions `Send Messages` + `Embed Links`. Open the generated URL and invite the bot to your org's Discord server.
4. Copy the **Application ID** from the **General Information** tab. This is `DISCORD_CLIENT_ID`.
5. (Optional but recommended) Enable Developer Mode in Discord, right-click your server icon → **Copy Server ID**. This is `DISCORD_GUILD_ID` — when set, slash commands register instantly instead of taking up to an hour globally.

### 2. Configure

```bash
cp .env.example .env
```

Fill in `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, and `ORG_SERVER_URL` / `ORG_SERVER_AUTH_TOKEN` (the same `AUTH_TOKEN` your Quantum Org Server uses).

### 3. Register slash commands

Run this once after configuring, and again whenever commands change:

```bash
npm install
npm run register
```

### 4. Run

**Development:**

```bash
npm run dev
```

**Production (Docker):**

```bash
docker compose up -d --build
```

If running alongside `quantum-org-server`, put both `docker-compose.yml` files on the same Docker network and set `ORG_SERVER_URL=http://quantum-org-server:3100` so the bot reaches it directly without exposing the org server's port publicly.

---

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22 |
| Language | TypeScript |
| Discord | discord.js v14 |
