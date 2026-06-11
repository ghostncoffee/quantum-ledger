import express from 'express';
import { db } from '../db';
import { startLogMonitor, stopLogMonitor } from '../lib/logMonitor';
import { testClanConnection, syncBlueprintsBatch, syncHangar } from '../lib/clanSync';

const router = express.Router();

/**
 * Pushes all locally-stored blueprints and vehicles to the clan server immediately
 * after a successful connection is established. Fire-and-forget — called after the
 * response is already sent so it never blocks or fails the settings save.
 */
async function pushInitialData(serverUrl: string): Promise<void> {
  try {
    // Blueprints — find the Star Citizen game record first
    const scGame = await db.get("SELECT id FROM games WHERE name = 'Star Citizen' LIMIT 1");
    if (scGame?.id) {
      const bpRows = await db.all(
        'SELECT product_name, mission_trigger, discovered_at FROM blueprints WHERE game_id = ?',
        [scGame.id],
      ) as Array<{ product_name: string; mission_trigger: string | null; discovered_at: string | null }>;

      if (bpRows.length > 0) {
        await syncBlueprintsBatch(bpRows);
        console.log(`[clan-sync] Initial push: ${bpRows.length} blueprint(s) sent to ${serverUrl}`);
      }

      // Vehicles / hangar
      const vRows = await db.all(
        'SELECT name, nickname, type, scu_capacity FROM vehicles WHERE game_id = ?',
        [scGame.id],
      ) as Array<{ name: string; nickname: string | null; type: string; scu_capacity: number | null }>;

      if (vRows.length > 0) {
        await syncHangar(vRows);
        console.log(`[clan-sync] Initial push: ${vRows.length} vehicle(s) sent to ${serverUrl}`);
      }
    }
  } catch (err) {
    console.error('[clan-sync] Initial push failed', err);
  }
}

router.get('/', async (_req, res) => {
  try {
    const rows = await db.all('SELECT key, value FROM settings');
    const settings = rows.reduce((acc: Record<string, string>, row: any) => {
      acc[row.key] = row.value;
      return acc;
    }, {});

    // Never return the raw clan-sync auth token — only whether one is set.
    settings.clanAuthTokenSet = settings.clanAuthToken ? 'true' : 'false';
    delete settings.clanAuthToken;

    res.json(settings);
  } catch (err) {
    console.error('[settings GET]', err);
    res.status(500).json({ error: 'Failed to read settings' });
  }
});

const CLAN_SYNC_BODY_KEYS = ['clanSyncEnabled', 'clanHandle', 'clanServerUrl', 'clanServerId', 'clanAuthToken'];

router.put('/', async (req, res) => {
  try {
    const body = req.body ?? {};

    if (CLAN_SYNC_BODY_KEYS.some(key => key in body)) {
      const handle = String(body.clanHandle ?? '').trim();
      const serverUrl = String(body.clanServerUrl ?? '').trim().replace(/\/+$/, '');
      const serverId = String(body.clanServerId ?? '').trim();
      const enabled = Boolean(body.clanSyncEnabled);

      // The client never gets the real token back (see GET handler), so an
      // empty/omitted value here means "keep the existing token".
      let authToken = String(body.clanAuthToken ?? '').trim();
      if (!authToken) {
        const existing = await db.get('SELECT value FROM settings WHERE key = ?', ['clanAuthToken']);
        authToken = existing?.value ?? '';
      }

      if (enabled) {
        if (!handle || !serverUrl || !serverId || !authToken) {
          return res.status(400).json({ error: 'Handle, Server URL, Server ID and Auth Token are all required to enable clan sync' });
        }
        const test = await testClanConnection(serverUrl, serverId, authToken);
        if (!test.ok) {
          return res.status(400).json({ error: test.error });
        }
      }

      for (const [key, value] of [
        ['clanSyncEnabled', enabled ? 'true' : 'false'],
        ['clanHandle', handle],
        ['clanServerUrl', serverUrl],
        ['clanServerId', serverId],
        ['clanAuthToken', authToken],
      ]) {
        await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
      }

      // Fire-and-forget initial push of all existing blueprints and vehicles
      if (enabled) {
        void pushInitialData(serverUrl);
      }

      return res.json({
        success: true,
        clanSyncEnabled: enabled,
        clanHandle: handle,
        clanServerUrl: serverUrl,
        clanServerId: serverId,
        clanAuthTokenSet: Boolean(authToken),
      });
    }

    const { logPath } = body;
    if (logPath == null) {
      return res.status(400).json({ error: 'logPath is required' });
    }

    await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['logPath', String(logPath)]);

    const defaultGame = await db.get('SELECT id FROM games WHERE name = ? LIMIT 1', ['Star Citizen']);
    if (!defaultGame?.id) {
      return res.status(500).json({ error: 'Could not find Star Citizen game record' });
    }

    await startLogMonitor(defaultGame.id, String(logPath));
    res.json({ success: true, logPath: String(logPath) });
  } catch (err) {
    console.error('[settings PUT]', err);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

export default router;
