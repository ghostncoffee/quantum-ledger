import { Router } from 'express';
import { db } from '../db';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { gameId, type, category, runId } = req.query;
    let q = `
      SELECT le.*, r.title as run_title, r.type as run_type, g.currency
      FROM ledger_entries le
      JOIN games g ON le.game_id = g.id
      LEFT JOIN runs r ON le.run_id = r.id
      WHERE 1=1
    `;
    const args: unknown[] = [];
    if (gameId) { q += ' AND le.game_id = ?'; args.push(gameId); }
    if (type) { q += ' AND le.type = ?'; args.push(type); }
    if (category) { q += ' AND le.category = ?'; args.push(category); }
    if (runId) { q += ' AND le.run_id = ?'; args.push(runId); }
    q += ' ORDER BY le.date DESC, le.created_at DESC';
    res.json(await db.all(q, args));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/summary', async (req, res) => {
  try {
    const { gameId } = req.query;
    let gameFilter = '';
    const args: unknown[] = [];
    if (gameId) { gameFilter = 'AND le.game_id = ?'; args.push(gameId); }

    const totals = await db.all(`
      SELECT
        g.id as game_id,
        g.name as game_name,
        g.currency,
        COALESCE(SUM(CASE WHEN le.type = 'income' THEN le.amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN le.type = 'expense' THEN le.amount ELSE 0 END), 0) as total_expenses,
        COALESCE(SUM(CASE WHEN le.type = 'investment' THEN le.amount ELSE 0 END), 0) as total_investment,
        COALESCE(SUM(CASE WHEN le.type = 'crew_payout' THEN le.amount ELSE 0 END), 0) as total_crew_payouts,
        COALESCE(SUM(CASE WHEN le.type = 'income' THEN le.amount ELSE -le.amount END), 0) as net
      FROM games g
      LEFT JOIN ledger_entries le ON le.game_id = g.id ${gameFilter}
      GROUP BY g.id
    `, args);

    res.json(totals);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/breakdown', async (req, res) => {
  try {
    const { gameId } = req.query;
    const args: unknown[] = [];
    let filter = '';
    if (gameId) { filter = 'WHERE game_id = ?'; args.push(gameId); }
    const rows = await db.all(`
      SELECT type, category, SUM(amount) as total, COUNT(*) as count
      FROM ledger_entries ${filter}
      GROUP BY type, category
      ORDER BY total DESC
    `, args);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/runs', async (req, res) => {
  try {
    const { gameId, type } = req.query;
    let q = `
      SELECT
        r.id, r.title, r.type, r.status, r.started_at, r.ended_at,
        g.name as game_name, g.currency,
        v.name as vehicle_name,
        COALESCE((SELECT SUM(total_revenue) FROM sales WHERE run_id = r.id), 0)
          + COALESCE((SELECT SUM(hj.agreed_payout + COALESCE(hj.bonus_payout, 0))
                      FROM hauling_jobs hj WHERE hj.run_id = r.id AND hj.status = 'delivered'), 0)
          + COALESCE((SELECT SUM(
              CASE WHEN is_shared = 1 AND shared_player_count > 0
                THEN (agreed_payout + COALESCE(bonus_payout, 0)) / shared_player_count
                ELSE (agreed_payout + COALESCE(bonus_payout, 0))
              END)
              FROM contracts WHERE run_id = r.id AND status = 'complete'), 0)
          as revenue,
        COALESCE((SELECT SUM(amount) FROM expenses WHERE run_id = r.id), 0) as expenses,
        COALESCE((SELECT SUM(amount) FROM ledger_entries WHERE run_id = r.id AND type = 'crew_payout'), 0) as crew_payouts,
        CASE WHEN r.started_at IS NOT NULL AND r.ended_at IS NOT NULL
          THEN ROUND((julianday(r.ended_at) - julianday(r.started_at)) * 24, 2)
          ELSE NULL
        END as duration_hours
      FROM runs r
      JOIN games g ON r.game_id = g.id
      LEFT JOIN vehicles v ON r.vehicle_id = v.id
      WHERE 1=1
    `;
    const args: unknown[] = [];
    if (gameId) { q += ' AND r.game_id = ?'; args.push(gameId); }
    if (type) { q += ' AND r.type = ?'; args.push(type); }
    q += ' ORDER BY r.created_at DESC';

    const rows = await db.all(q, args);
    const result = rows.map((r: any) => ({
      ...r,
      profit: r.revenue - r.expenses - r.crew_payouts,
      profitPerHour: r.duration_hours ? Math.round((r.revenue - r.expenses - r.crew_payouts) / r.duration_hours) : null,
    }));

    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  const { gameId, runId, type, category, amount, description, date } = req.body;
  if (!gameId || !type || !category || amount == null || !description) {
    return res.status(400).json({ error: 'gameId, type, category, amount, description required' });
  }
  try {
    const result = await db.run(
      'INSERT INTO ledger_entries (game_id, run_id, type, category, amount, description, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [gameId, runId ?? null, type, category, amount, description, date ?? new Date().toISOString().split('T')[0]]
    );
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  const { type, category, amount, description, date } = req.body;
  try {
    await db.run(`
      UPDATE ledger_entries SET
        type = COALESCE(?, type),
        category = COALESCE(?, category),
        amount = COALESCE(?, amount),
        description = COALESCE(?, description),
        date = COALESCE(?, date)
      WHERE id = ?
    `, [type ?? null, category ?? null, amount ?? null, description ?? null, date ?? null, req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM ledger_entries WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
