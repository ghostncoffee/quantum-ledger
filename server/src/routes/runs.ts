import { Router } from 'express';
import { db } from '../db';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { gameId, type, status } = req.query;
    let q = `
      SELECT
        r.*,
        g.name as game_name,
        g.currency,
        v.name as vehicle_name,
        v.type as vehicle_type,
        (SELECT COALESCE(SUM(total_revenue), 0) FROM sales WHERE run_id = r.id)
          + COALESCE((SELECT SUM(hj.agreed_payout + COALESCE(hj.bonus_payout, 0))
                      FROM hauling_jobs hj WHERE hj.run_id = r.id AND hj.status = 'delivered'), 0)
          + COALESCE((SELECT SUM(
              CASE WHEN is_shared = 1 AND shared_player_count > 0
                THEN (agreed_payout + COALESCE(bonus_payout, 0)) / shared_player_count
                ELSE (agreed_payout + COALESCE(bonus_payout, 0))
              END)
              FROM contracts WHERE run_id = r.id AND status = 'complete'), 0)
          as total_revenue,
        (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE run_id = r.id) as total_expenses,
        (SELECT COUNT(*) FROM run_crew WHERE run_id = r.id) as crew_count,
        CASE
          WHEN r.started_at IS NOT NULL AND r.ended_at IS NOT NULL
          THEN ROUND((julianday(r.ended_at) - julianday(r.started_at)) * 24, 2)
          ELSE NULL
        END as duration_hours
      FROM runs r
      LEFT JOIN games g ON r.game_id = g.id
      LEFT JOIN vehicles v ON r.vehicle_id = v.id
      WHERE 1=1
    `;
    const args: unknown[] = [];
    if (gameId) { q += ' AND r.game_id = ?'; args.push(gameId); }
    if (type) { q += ' AND r.type = ?'; args.push(type); }
    if (status) { q += ' AND r.status = ?'; args.push(status); }
    q += ' ORDER BY r.created_at DESC';
    res.json(await db.all(q, args));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const run = await db.get(`
      SELECT r.*, g.name as game_name, g.currency, v.name as vehicle_name
      FROM runs r
      LEFT JOIN games g ON r.game_id = g.id
      LEFT JOIN vehicles v ON r.vehicle_id = v.id
      WHERE r.id = ?
    `, [req.params.id]);
    if (!run) return res.status(404).json({ error: 'not found' });

    const crew = await db.all(`
      SELECT rc.*, cm.name as member_name, cm.game_handle
      FROM run_crew rc
      JOIN crew_members cm ON rc.crew_member_id = cm.id
      WHERE rc.run_id = ?
    `, [req.params.id]);

    const expenses = await db.all('SELECT * FROM expenses WHERE run_id = ? ORDER BY date', [req.params.id]);
    const sales = await db.all('SELECT * FROM sales WHERE run_id = ? ORDER BY sold_at', [req.params.id]);
    const haulingJobs = await db.all('SELECT * FROM hauling_jobs WHERE run_id = ? ORDER BY id', [req.params.id]);
    const contracts = await db.all('SELECT * FROM contracts WHERE run_id = ? ORDER BY id', [req.params.id]);

    const salesRevenue = (sales as any[]).reduce((s: number, r: any) => s + r.total_revenue, 0);
    const haulingRevenue = (haulingJobs as any[])
      .filter((j: any) => j.status === 'delivered')
      .reduce((s: number, j: any) => s + j.agreed_payout + (j.bonus_payout || 0), 0);
    const contractRevenue = (contracts as any[])
      .filter((c: any) => c.status === 'complete')
      .reduce((s: number, c: any) => {
        const total = c.agreed_payout + (c.bonus_payout || 0);
        return s + (c.is_shared && c.shared_player_count > 0 ? total / c.shared_player_count : total);
      }, 0);
    const revenue = salesRevenue + haulingRevenue + contractRevenue;
    const costs = (expenses as any[]).reduce((s: number, e: any) => s + e.amount, 0);
    const profit = revenue - costs;

    let durationHours: number | null = null;
    if (run.started_at && run.ended_at) {
      const ms = new Date(run.ended_at).getTime() - new Date(run.started_at).getTime();
      durationHours = Math.round((ms / 3600000) * 100) / 100;
    }

    res.json({ ...run, crew, expenses, sales, haulingJobs, contracts, revenue, costs, profit, durationHours });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  const { gameId, vehicleId, type, title, location, startedAt, notes, crew = [] } = req.body;
  if (!gameId || !type) return res.status(400).json({ error: 'gameId and type required' });
  try {
    const result = await db.run(
      'INSERT INTO runs (game_id, vehicle_id, type, title, location, started_at, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [gameId, vehicleId ?? null, type, title ?? null, location ?? null, startedAt ?? new Date().toISOString(), notes ?? null]
    );
    const runId = result.lastInsertRowid;

    for (const member of crew) {
      await db.run(
        'INSERT INTO run_crew (run_id, crew_member_id, role, payout_type, payout_value) VALUES (?, ?, ?, ?, ?)',
        [runId, member.crewMemberId, member.role ?? null, member.payoutType ?? 'percentage', member.payoutValue ?? 0]
      );
    }

    res.status(201).json({ id: runId });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  const { vehicleId, status, title, location, startedAt, endedAt, notes } = req.body;
  try {
    await db.run(`
      UPDATE runs SET
        vehicle_id = COALESCE(?, vehicle_id),
        status = COALESCE(?, status),
        title = COALESCE(?, title),
        location = COALESCE(?, location),
        started_at = COALESCE(?, started_at),
        ended_at = COALESCE(?, ended_at),
        notes = COALESCE(?, notes)
      WHERE id = ?
    `, [vehicleId ?? null, status ?? null, title ?? null, location ?? null, startedAt ?? null, endedAt ?? null, notes ?? null, req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/complete', async (req, res) => {
  try {
    const now = new Date().toISOString();
    await db.run("UPDATE runs SET status = 'completed', ended_at = COALESCE(ended_at, ?) WHERE id = ?", [now, req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM runs WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/:id/crew', async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT rc.*, cm.name as member_name, cm.game_handle
      FROM run_crew rc
      JOIN crew_members cm ON rc.crew_member_id = cm.id
      WHERE rc.run_id = ?
    `, [req.params.id]);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/crew', async (req, res) => {
  const { crewMemberId, role, payoutType = 'percentage', payoutValue = 0 } = req.body;
  if (!crewMemberId) return res.status(400).json({ error: 'crewMemberId required' });
  try {
    const result = await db.run(
      'INSERT INTO run_crew (run_id, crew_member_id, role, payout_type, payout_value) VALUES (?, ?, ?, ?, ?)',
      [req.params.id, crewMemberId, role ?? null, payoutType, payoutValue]
    );
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/:id/crew/:crewId', async (req, res) => {
  const { role, payoutType, payoutValue, payoutSettled, actualPayout } = req.body;
  try {
    await db.run(`
      UPDATE run_crew SET
        role = COALESCE(?, role),
        payout_type = COALESCE(?, payout_type),
        payout_value = COALESCE(?, payout_value),
        payout_settled = COALESCE(?, payout_settled),
        actual_payout = COALESCE(?, actual_payout)
      WHERE id = ? AND run_id = ?
    `, [role ?? null, payoutType ?? null, payoutValue ?? null, payoutSettled ?? null, actualPayout ?? null, req.params.crewId, req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id/crew/:crewId', async (req, res) => {
  try {
    await db.run('DELETE FROM run_crew WHERE id = ? AND run_id = ?', [req.params.crewId, req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
