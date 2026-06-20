import fs from 'fs';
import path from 'path';
import { db } from '../db';
import { syncBlueprintDiscovery } from './clanSync';

interface WatcherState {
  guidMap: Map<string, { debugName: string; generator: string; contractDefinitionId: string | null }>;
  active: Map<string, { guid: string; debugName: string; generator: string; startTs: number; contractDefinitionId: string | null }>;
  recentLifecycle: Array<{ trigger: 'accept' | 'complete'; guid: string; debugName: string; ts: number; contractDefinitionId: string | null }>;
}

const BLUEPRINT_CORRELATION_WINDOW_SEC = 5.0;

const PATTERN_TIMESTAMP = /^<([0-9T:\-.Z]+)>/;
const PATTERN_MARKER = /CreateMarker.*missionId \[([^\]]+)\].*generator name \[([^\]]+)\].*contract \[([^\]]+)\]/;
const PATTERN_MARKER_DEF_ID = /contractDefinitionId\[([^\]]+)\]/;
const PATTERN_ACCEPTED = /Added notification "Contract Accepted:.*?MissionId: \[([^\]]+)\]/;
const PATTERN_END_MISSION = /<EndMission>.*MissionId\[([^\]]+)\].*CompletionType\[(\w+)\].*Reason\[([^\]]+)\]/;
const PATTERN_BLUEPRINT = /Added notification "Received Blueprint: ([^:]+):/;

function parseLogTimestamp(line: string): number {
  const m = PATTERN_TIMESTAMP.exec(line);
  if (!m) return Date.now() / 1000;
  const raw = m[1].replace('Z', '+00:00');
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? Date.now() / 1000 : ms / 1000;
}

/**
 * Splits a freshly-read tail chunk into complete (non-blank) lines plus the
 * byte count consumed, holding back any unterminated trailing line so a
 * half-written log entry isn't parsed before its newline arrives. Exported for testing.
 */
export function splitCompleteLines(chunk: string): { lines: string[]; consumedBytes: number } {
  const lastNl = chunk.lastIndexOf('\n');
  if (lastNl === -1) return { lines: [], consumedBytes: 0 };
  const complete = chunk.slice(0, lastNl);
  return {
    lines: complete.split('\n').filter(l => l.trim()),
    consumedBytes: Buffer.byteLength(complete + '\n', 'utf-8'),
  };
}

function createWatcherState(): WatcherState {
  return {
    guidMap: new Map(),
    active: new Map(),
    recentLifecycle: [],
  };
}

function recordMarker(state: WatcherState, guid: string, generator: string, contract: string, contractDefinitionId: string | null): void {
  if (!state.guidMap.has(guid)) {
    state.guidMap.set(guid, { debugName: contract, generator, contractDefinitionId });
  }
}

function recordAccepted(state: WatcherState, guid: string, ts: number): void {
  const entry = state.guidMap.get(guid);
  if (!entry) return;
  state.active.set(guid, { guid, debugName: entry.debugName, generator: entry.generator, startTs: ts, contractDefinitionId: entry.contractDefinitionId });
  state.recentLifecycle.push({ trigger: 'accept', guid, debugName: entry.debugName, ts, contractDefinitionId: entry.contractDefinitionId });
  if (state.recentLifecycle.length > 32) state.recentLifecycle.shift();
}

function recordEnd(state: WatcherState, guid: string, completion: string, ts: number): void {
  const active = state.active.get(guid);
  if (active) state.active.delete(guid);
  const entry = state.guidMap.get(guid);
  if (completion === 'Complete') {
    const debugName = active?.debugName ?? entry?.debugName ?? '?';
    const contractDefinitionId = active?.contractDefinitionId ?? entry?.contractDefinitionId ?? null;
    state.recentLifecycle.push({ trigger: 'complete', guid, debugName, ts, contractDefinitionId });
    if (state.recentLifecycle.length > 32) state.recentLifecycle.shift();
  }
}

function correlateBlueprint(state: WatcherState, ts: number): (typeof state.recentLifecycle)[0] | null {
  let best: (typeof state.recentLifecycle)[0] | null = null;
  let bestDelta = BLUEPRINT_CORRELATION_WINDOW_SEC + 1.0;
  for (const e of state.recentLifecycle) {
    const delta = ts - e.ts;
    if (delta >= 0 && delta <= BLUEPRINT_CORRELATION_WINDOW_SEC && delta < bestDelta) {
      best = e;
      bestDelta = delta;
    }
  }
  return best;
}

async function processLine(line: string, state: WatcherState, gameId: number): Promise<void> {
  const ts = parseLogTimestamp(line);

  const markerMatch = PATTERN_MARKER.exec(line);
  if (markerMatch) {
    const defIdMatch = PATTERN_MARKER_DEF_ID.exec(line);
    recordMarker(state, markerMatch[1], markerMatch[2], markerMatch[3], defIdMatch ? defIdMatch[1] : null);
    return;
  }

  const acceptedMatch = PATTERN_ACCEPTED.exec(line);
  if (acceptedMatch) {
    recordAccepted(state, acceptedMatch[1], ts);
    return;
  }

  const endMatch = PATTERN_END_MISSION.exec(line);
  if (endMatch) {
    recordEnd(state, endMatch[1], endMatch[2], ts);
    return;
  }

  const blueprintMatch = PATTERN_BLUEPRINT.exec(line);
  if (blueprintMatch) {
    const productName = blueprintMatch[1].trim();
    const corr = correlateBlueprint(state, ts);
    const missionGuid = corr?.guid ?? null;
    const missionDebugName = corr?.debugName ?? null;
    const missionTrigger = corr?.trigger ?? null;
    const result = await db.run(
      `INSERT OR IGNORE INTO blueprints (game_id, product_name, mission_guid, mission_debug_name, mission_trigger)
       VALUES (?, ?, ?, ?, ?)`,
      [gameId, productName, missionGuid, missionDebugName, missionTrigger]
    );
    if (result.rowsAffected > 0) {
      void syncBlueprintDiscovery({
        productName,
        missionGuid,
        missionDebugName,
        missionTrigger,
        discoveredAt: new Date().toISOString(),
      });
    }
  }
}

export class LogMonitor {
  private logPath: string | null = null;
  private watcherId: ReturnType<typeof fs.watch> | null = null;
  private gameId: number | null = null;
  private state: WatcherState | null = null;
  private lastPosition = 0;
  private isProcessing = false;

  private resolveGameLogPath(candidate: string): string | null {
    try {
      const resolved = path.resolve(candidate);
      const stats = fs.statSync(resolved);
      if (stats.isFile()) {
        return resolved;
      }
      if (stats.isDirectory()) {
        const candidates = [
          path.join(resolved, 'LIVE', 'Game.log'),
          path.join(resolved, 'PTU', 'Game.log'),
          path.join(resolved, 'Game.log'),
        ];
        for (const p of candidates) {
          if (fs.existsSync(p) && fs.statSync(p).isFile()) {
            return p;
          }
        }
      }
    } catch {
      // ignore invalid path
    }
    return null;
  }

  async initialize(gameId: number, configuredPath?: string): Promise<void> {
    this.gameId = gameId;
    this.state = createWatcherState();

    if (configuredPath) {
      const resolved = this.resolveGameLogPath(configuredPath);
      if (resolved) {
        this.logPath = resolved;
      } else {
        console.log(`[LogMonitor] Configured path not valid: ${configuredPath}`);
      }
    }

    if (!this.logPath) {
      const commonPaths = [
        'C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE\\Game.log',
        'C:\\Program Files (x86)\\Roberts Space Industries\\StarCitizen\\LIVE\\Game.log',
      ];
      for (const p of commonPaths) {
        try {
          if (fs.existsSync(p)) {
            this.logPath = p;
            break;
          }
        } catch {
          // Continue
        }
      }
    }

    if (!this.logPath) {
      console.log('[LogMonitor] Game.log not found in common paths or configured install directory');
      return;
    }

    console.log(`[LogMonitor] Watching Game.log at ${this.logPath}`);
    await this.replayExistingLog();
    this.startWatching();
  }

  private async replayExistingLog(): Promise<void> {
    if (!this.logPath || !this.state || !this.gameId) return;

    try {
      const content = fs.readFileSync(this.logPath, 'utf-8');
      const lines = content.split('\n');
      for (const line of lines) {
        if (line) {
          await processLine(line, this.state, this.gameId);
        }
      }
      this.lastPosition = Buffer.byteLength(content, 'utf-8');
      console.log('[LogMonitor] Replayed existing Game.log');
    } catch (err) {
      console.error('[LogMonitor] Error replaying log:', err);
    }
  }

  private startWatching(): void {
    if (!this.logPath) return;

    try {
      this.watcherId = fs.watch(this.logPath, async () => {
        if (this.isProcessing) return;
        this.isProcessing = true;
        try {
          await this.processTail();
        } finally {
          this.isProcessing = false;
        }
      });
      console.log('[LogMonitor] Started watching Game.log');
    } catch (err) {
      console.error('[LogMonitor] Error starting watcher:', err);
    }
  }

  private async processTail(): Promise<void> {
    if (!this.logPath || !this.state || !this.gameId) return;

    try {
      const size = fs.statSync(this.logPath).size;
      if (size < this.lastPosition) this.lastPosition = 0; // log rotated/truncated (SC restart) — replay from the top
      if (size <= this.lastPosition) return;

      // Read only the appended bytes instead of re-reading the whole file each event.
      const fd = fs.openSync(this.logPath, 'r');
      let chunk: string;
      try {
        const buf = Buffer.alloc(size - this.lastPosition);
        fs.readSync(fd, buf, 0, buf.length, this.lastPosition);
        chunk = buf.toString('utf-8');
      } finally {
        fs.closeSync(fd);
      }

      const { lines, consumedBytes } = splitCompleteLines(chunk);
      for (const line of lines) {
        await processLine(line, this.state, this.gameId);
      }
      this.lastPosition += consumedBytes;
      // ponytail: utf-8 read at a byte offset; SC logs are ASCII so a multibyte char split won't happen
    } catch (err) {
      console.error('[LogMonitor] Error processing tail:', err);
    }
  }

  stop(): void {
    if (this.watcherId) {
      this.watcherId.close();
      this.watcherId = null;
      console.log('[LogMonitor] Stopped watching Game.log');
    }
  }
}

let monitor: LogMonitor | null = null;

export async function startLogMonitor(gameId: number, logPath?: string): Promise<void> {
  if (monitor) {
    monitor.stop();
  }
  monitor = new LogMonitor();
  await monitor.initialize(gameId, logPath);
}

export function stopLogMonitor(): void {
  if (monitor) {
    monitor.stop();
    monitor = null;
  }
}
