import { Router } from 'express';
import { db } from '../db';
import { routeError } from '../lib/routeError';

const router = Router();

const PERIODS: Record<string, string | null> = {
  today:    '-1 day',
  week:     '-7 days',
  month:    '-30 days',
  all_time: null,
};

function periodFilter(period: string): { sessionClause: string; activityClause: string; args: unknown[] } {
  const offset = PERIODS[period] !== undefined ? PERIODS[period] : PERIODS.week;
  if (!offset) return { sessionClause: '', activityClause: '', args: [] };
  return {
    sessionClause: `AND s.occurred_at >= datetime('now', ?)`,
    activityClause: `AND a.occurred_at >= datetime('now', ?)`,
    args: [offset],
  };
}

// GET /api/leaderboard/:metric?period=week&limit=10
// Supported metrics: sessions, activity, hauling, contract, mining, salvage
router.get('/:metric', async (req, res) => {
  const metric = req.params.metric;
  const period = String(req.query.period ?? 'week');
  const limit  = Math.min(Number(req.query.limit ?? 10), 50);
  const { sessionClause, activityClause, args } = periodFilter(period);

  try {
    let rows: any[];

    if (metric === 'sessions') {
      rows = await db.all(`
        SELECT m.username, COUNT(s.id) AS value
        FROM members m
        LEFT JOIN uploaded_sessions s ON s.member_id = m.id ${sessionClause}
        WHERE m.status = 'approved'
        GROUP BY m.id
        ORDER BY value DESC
        LIMIT ?
      `, [...args, limit]);
    } else if (metric === 'activity') {
      rows = await db.all(`
        SELECT m.username, COUNT(a.id) AS value
        FROM members m
        LEFT JOIN activity_log a ON a.member_id = m.id ${activityClause}
        WHERE m.status = 'approved'
        GROUP BY m.id
        ORDER BY value DESC
        LIMIT ?
      `, [...args, limit]);
    } else if (['hauling', 'contract', 'mining', 'salvage', 'refining'].includes(metric)) {
      rows = await db.all(`
        SELECT m.username, COALESCE(SUM(a.amount), 0) AS value
        FROM members m
        LEFT JOIN activity_log a
          ON a.member_id = m.id AND a.activity_type = ? ${activityClause}
        WHERE m.status = 'approved'
        GROUP BY m.id
        ORDER BY value DESC
        LIMIT ?
      `, [metric, ...args, limit]);
    } else {
      res.status(400).json({ error: `Unknown metric "${metric}". Valid: sessions, activity, hauling, contract, mining, salvage, refining` });
      return;
    }

    res.json({
      metric,
      period: PERIODS[period] !== undefined ? period : 'week',
      entries: (rows as any[]).map((r: any, i: number) => ({
        rank: i + 1,
        username: r.username,
        value: Number(r.value ?? 0),
      })),
    });
  } catch (e: unknown) { routeError(res, e); }
});

export default router;
