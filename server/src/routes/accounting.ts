import { Router } from 'express';
import { routeError } from '../lib/routeError';
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
  } catch (e: unknown) { routeError(res, e); }
});

router.get('/summary', async (req, res) => {
  try {
    const { gameId } = req.query;
    const gId = gameId ? Number(gameId) : null;

    // Compute revenue and costs directly from operational tables — not ledger_entries (which is manual-only).
    const games = await db.all(
      `SELECT id as game_id, name as game_name, currency FROM games ${gId ? 'WHERE id = ?' : ''}`,
      gId ? [gId] : []
    );

    const result = await Promise.all((games as any[]).map(async (g: any) => {
      // Sales revenue (mining, trading)
      const [salesRow] = await db.all(
        `SELECT COALESCE(SUM(s.total_revenue), 0) as total
         FROM sales s JOIN runs r ON s.run_id = r.id WHERE r.game_id = ?`,
        [g.game_id]
      );
      // Hauling revenue (delivered jobs)
      const [haulingRow] = await db.all(
        `SELECT COALESCE(SUM(hj.agreed_payout + COALESCE(hj.bonus_payout, 0)), 0) as total
         FROM hauling_jobs hj JOIN runs r ON hj.run_id = r.id
         WHERE r.game_id = ? AND hj.status = 'delivered'`,
        [g.game_id]
      );
      // Contract revenue (completed)
      const [contractRow] = await db.all(
        `SELECT COALESCE(SUM(
           CASE WHEN c.is_shared = 1 AND c.shared_player_count > 0
                THEN (c.agreed_payout + COALESCE(c.bonus_payout, 0)) / c.shared_player_count
                ELSE c.agreed_payout + COALESCE(c.bonus_payout, 0)
           END), 0) as total
         FROM contracts c JOIN runs r ON c.run_id = r.id
         WHERE r.game_id = ? AND c.status = 'complete'`,
        [g.game_id]
      );
      // Expenses (linked to a run in this game, or directly tagged with game_id)
      const [expRow] = await db.all(
        `SELECT COALESCE(SUM(e.amount), 0) as total
         FROM expenses e
         LEFT JOIN runs r ON e.run_id = r.id
         WHERE COALESCE(r.game_id, e.game_id) = ?`,
        [g.game_id]
      );
      // Crew payouts (settled)
      const [crewRow] = await db.all(
        `SELECT COALESCE(SUM(rc.actual_payout), 0) as total
         FROM run_crew rc JOIN runs r ON rc.run_id = r.id
         WHERE r.game_id = ? AND rc.payout_settled = 1`,
        [g.game_id]
      );

      const income = (salesRow?.total || 0) + (haulingRow?.total || 0) + (contractRow?.total || 0);
      const exp = expRow?.total || 0;
      const crewPay = crewRow?.total || 0;

      return {
        game_id: g.game_id,
        game_name: g.game_name,
        currency: g.currency,
        total_income: income,
        total_expenses: exp,
        total_investment: 0,
        total_crew_payouts: crewPay,
        net: income - exp - crewPay,
      };
    }));

    res.json(result);
  } catch (e: unknown) { routeError(res, e); }
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
  } catch (e: unknown) { routeError(res, e); }
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
  } catch (e: unknown) { routeError(res, e); }
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
  } catch (e: unknown) { routeError(res, e); }
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
  } catch (e: unknown) { routeError(res, e); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM ledger_entries WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e: unknown) { routeError(res, e); }
});

export default router;
