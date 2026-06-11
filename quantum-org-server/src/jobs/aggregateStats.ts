import cron from 'node-cron';
import crypto from 'crypto';
import { db } from '../db';
import { logger } from '../lib/logger';

let running = false;

const PERIODS: Array<{ key: string; offset: string | null }> = [
  { key: 'today',    offset: '-1 day' },
  { key: 'week',     offset: '-7 days' },
  { key: 'month',    offset: '-30 days' },
  { key: 'all_time', offset: null },
];

async function aggregate(): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (const { key, offset } of PERIODS) {
      const timeClause  = offset ? `AND occurred_at >= datetime('now', ?)` : '';
      const timeClauseS = offset ? `AND s.occurred_at >= datetime('now', ?)` : '';
      const timeArgs = offset ? [offset] : [];

      const [sessionTotals, sessionsByType, leaderboard] = await Promise.all([
        db.get(`
          SELECT COUNT(*) AS session_count, COUNT(DISTINCT member_id) AS active_members
          FROM uploaded_sessions WHERE 1=1 ${timeClause}
        `, timeArgs),
        db.all(`
          SELECT session_type, COUNT(*) AS count
          FROM uploaded_sessions WHERE 1=1 ${timeClause}
          GROUP BY session_type ORDER BY count DESC
        `, timeArgs),
        db.all(`
          SELECT m.username, COUNT(s.id) AS session_count
          FROM members m
          LEFT JOIN uploaded_sessions s ON s.member_id = m.id ${timeClauseS}
          GROUP BY m.id ORDER BY session_count DESC LIMIT 10
        `, timeArgs),
      ]);

      const memberCount = await db.get('SELECT COUNT(*) AS count FROM members');

      const value = JSON.stringify({
        sessionCount: sessionTotals?.session_count ?? 0,
        activeMembers: sessionTotals?.active_members ?? 0,
        memberCount: memberCount?.count ?? 0,
        sessionsByType,
        topByActivity: leaderboard,
        calculatedAt: new Date().toISOString(),
      });

      await db.run(`
        INSERT INTO clan_stats (id, stat_type, time_period, value)
        VALUES (?, 'clan_overview', ?, ?)
        ON CONFLICT (stat_type, time_period)
        DO UPDATE SET value = excluded.value, calculated_at = datetime('now')
      `, [crypto.randomUUID(), key, value]);
    }
    logger.info('[aggregate] Stats cache updated');
  } catch (err) {
    logger.error('[aggregate] Failed', err);
  } finally {
    running = false;
  }
}

export function startAggregationJob(): void {
  // Warm the cache immediately on startup, then every 15 minutes
  aggregate().catch(err => logger.error('[aggregate] Initial run failed', err));
  cron.schedule('*/15 * * * *', () => {
    aggregate().catch(err => logger.error('[aggregate] Scheduled run failed', err));
  });
  logger.info('[aggregate] Job scheduled (every 15 minutes)');
}
