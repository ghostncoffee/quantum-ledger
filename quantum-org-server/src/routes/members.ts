import { Router } from 'express';
import { db } from '../db';
import { routeError } from '../lib/routeError';
import { logger } from '../lib/logger';

const router = Router();

// GET /api/members
//   ?status=approved (default) — only approved members (used by ledger proxy)
//   ?status=pending             — only pending
//   ?status=all                 — all members (used by admin dashboard)
router.get('/', async (req, res) => {
  const limit  = Math.min(Number(req.query.limit ?? 200), 500);
  const offset = Math.max(Number(req.query.offset ?? 0), 0);
  const status = String(req.query.status ?? 'approved');

  const params: unknown[] = [];
  let statusFilter = '';
  if (status !== 'all') {
    statusFilter = 'AND m.status = ?';
    params.push(status === 'pending' ? 'pending' : 'approved');
  }
  params.push(limit, offset);

  try {
    const rows = await db.all(
      `SELECT m.id, m.username, m.status, m.first_seen, m.last_seen,
              COUNT(DISTINCT s.id)  AS session_count,
              COUNT(DISTINCT sh.id) AS ship_count
         FROM members m
         LEFT JOIN uploaded_sessions s  ON s.member_id  = m.id
         LEFT JOIN member_ships     sh ON sh.member_id = m.id
        WHERE 1=1 ${statusFilter}
        GROUP BY m.id
        ORDER BY m.last_seen DESC
        LIMIT ? OFFSET ?`,
      params,
    );
    res.json(rows);
  } catch (e: unknown) { routeError(res, e); }
});

// GET /api/members/ships — clan fleet aggregated by ship name (must be before /:username)
router.get('/ships', async (_req, res) => {
  try {
    const rows = await db.all(`
      SELECT sh.name, sh.type,
             COALESCE(MAX(sh.scu_capacity), 0) AS scu_capacity,
             COUNT(*) AS count
      FROM member_ships sh
      JOIN members m ON sh.member_id = m.id
      WHERE m.status = 'approved'
      GROUP BY sh.name
      ORDER BY count DESC, sh.name
    `);
    res.json(rows);
  } catch (e: unknown) { routeError(res, e); }
});

// PATCH /api/members/:id/status — approve, reject, or reset to pending
router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected', 'pending'].includes(status)) {
    res.status(400).json({ error: 'status must be approved, rejected, or pending' });
    return;
  }
  try {
    const member = await db.get('SELECT username FROM members WHERE id = ?', [req.params.id]) as any;
    if (!member) { res.status(404).json({ error: 'Member not found' }); return; }
    await db.run('UPDATE members SET status = ? WHERE id = ?', [status, req.params.id]);
    logger.info(`Member ${member.username} status → ${status}`);
    res.json({ ok: true });
  } catch (e: unknown) { routeError(res, e); }
});

router.get('/:username', async (req, res) => {
  try {
    const member = await db.get(
      'SELECT id, username, status, first_seen, last_seen, metadata FROM members WHERE username = ?',
      [req.params.username],
    );
    if (!member) { res.status(404).json({ error: 'Member not found' }); return; }

    const [sessionCounts, recentActivity, ships] = await Promise.all([
      db.all(
        `SELECT session_type, COUNT(*) AS count
           FROM uploaded_sessions WHERE member_id = ?
          GROUP BY session_type ORDER BY count DESC`,
        [member.id],
      ),
      db.all(
        `SELECT activity_type, description, amount, occurred_at
           FROM activity_log WHERE member_id = ?
          ORDER BY occurred_at DESC LIMIT 10`,
        [member.id],
      ),
      db.all(
        'SELECT name, nickname, type, scu_capacity FROM member_ships WHERE member_id = ? ORDER BY name',
        [member.id],
      ),
    ]);

    res.json({ ...member, sessionCounts, recentActivity, ships });
  } catch (e: unknown) { routeError(res, e); }
});

export default router;
