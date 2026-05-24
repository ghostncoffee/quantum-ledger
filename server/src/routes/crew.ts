import { Router } from 'express';
import { db } from '../db';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { gameId } = req.query;
    const rows = gameId
      ? await db.all('SELECT * FROM crew_members WHERE game_id = ? ORDER BY name', [gameId])
      : await db.all('SELECT cm.*, g.name as game_name FROM crew_members cm LEFT JOIN games g ON cm.game_id = g.id ORDER BY cm.name');
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const row = await db.get('SELECT * FROM crew_members WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'not found' });
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  const { name, gameHandle, gameId, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const result = await db.run(
      'INSERT INTO crew_members (name, game_handle, game_id, notes) VALUES (?, ?, ?, ?)',
      [name, gameHandle ?? null, gameId ?? null, notes ?? null]
    );
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  const { name, gameHandle, gameId, notes } = req.body;
  try {
    await db.run(
      'UPDATE crew_members SET name = COALESCE(?, name), game_handle = COALESCE(?, game_handle), game_id = COALESCE(?, game_id), notes = COALESCE(?, notes) WHERE id = ?',
      [name ?? null, gameHandle ?? null, gameId ?? null, notes ?? null, req.params.id]
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM crew_members WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Full history for a crew member: run entries + contract entries + summary
router.get('/:id/history', async (req, res) => {
  try {
    const runCrewRows = await db.all(`
      SELECT
        rc.id, rc.run_id, rc.role, rc.payout_type, rc.payout_value,
        rc.payout_settled, rc.actual_payout,
        r.title as run_title, r.type as run_type, r.status as run_status,
        r.created_at as run_created_at, r.started_at,
        g.name as game_name, g.currency,
        COALESCE((SELECT SUM(total_revenue) FROM sales WHERE run_id = r.id), 0)
          + COALESCE((SELECT SUM(hj.agreed_payout + COALESCE(hj.bonus_payout, 0))
                      FROM hauling_jobs hj WHERE hj.run_id = r.id AND hj.status = 'delivered'), 0)
          + COALESCE((SELECT SUM(c2.agreed_payout + COALESCE(c2.bonus_payout, 0))
                      FROM contracts c2 WHERE c2.run_id = r.id AND c2.status = 'complete'), 0)
          - COALESCE((SELECT SUM(amount) FROM expenses WHERE run_id = r.id), 0)
          as run_profit
      FROM run_crew rc
      JOIN runs r ON rc.run_id = r.id
      JOIN games g ON r.game_id = g.id
      WHERE rc.crew_member_id = ?
      ORDER BY r.created_at DESC
    `, [req.params.id]);

    const contractCrewRows = await db.all(`
      SELECT
        cc.id, cc.contract_id, cc.role, cc.payout_type, cc.payout_value,
        cc.payout_settled, cc.actual_payout,
        c.type as contract_type, c.client_name, c.status as contract_status,
        c.agreed_payout, c.bonus_payout, c.run_id,
        c.is_shared, c.shared_player_count,
        r.title as run_title, r.type as run_type, r.started_at,
        g.name as game_name, g.currency,
        (c.agreed_payout + COALESCE(c.bonus_payout, 0)) as contract_total
      FROM contract_crew cc
      JOIN contracts c ON cc.contract_id = c.id
      JOIN runs r ON c.run_id = r.id
      JOIN games g ON r.game_id = g.id
      WHERE cc.crew_member_id = ?
      ORDER BY cc.id DESC
    `, [req.params.id]);

    const runCrew = (runCrewRows as any[]).map((rc: any) => ({
      ...rc,
      calculated_payout: rc.payout_type === 'percentage'
        ? (rc.run_profit * rc.payout_value) / 100
        : rc.payout_value,
    }));

    const contractCrew = (contractCrewRows as any[]).map((cc: any) => {
      const total = cc.contract_total as number;
      const calculated_payout = cc.is_shared && cc.shared_player_count > 0
        ? total / cc.shared_player_count
        : cc.payout_type === 'percentage'
          ? (total * cc.payout_value) / 100
          : cc.payout_value;
      return { ...cc, calculated_payout };
    });

    // Only count manually-settled payouts (shared contracts are auto-paid by game)
    const totalSettled = [
      ...runCrew.filter((r: any) => r.payout_settled).map((r: any) => r.actual_payout || 0),
      ...contractCrew.filter((c: any) => c.payout_settled && !c.is_shared).map((c: any) => c.actual_payout || 0),
    ].reduce((s: number, v: number) => s + v, 0);

    // Outstanding = only entries the user still needs to manually settle (skip shared)
    const totalOutstanding = [
      ...runCrew.filter((r: any) => !r.payout_settled).map((r: any) => r.calculated_payout),
      ...contractCrew.filter((c: any) => !c.payout_settled && !c.is_shared).map((c: any) => c.calculated_payout),
    ].reduce((s: number, v: number) => s + v, 0);

    res.json({
      runCrew,
      contractCrew,
      summary: {
        totalSettled,
        totalOutstanding,
        runsCount: runCrew.length,
        contractsCount: contractCrew.length,
      },
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Set a crew member as the player character (clears any previously set player)
router.post('/:id/player', async (req, res) => {
  try {
    await db.run('UPDATE crew_members SET is_player = 0');
    await db.run('UPDATE crew_members SET is_player = 1 WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Unset player flag
router.delete('/:id/player', async (req, res) => {
  try {
    await db.run('UPDATE crew_members SET is_player = 0 WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
