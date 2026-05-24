import { Router } from 'express';
import { db } from '../db';

const router = Router();

// GET /contracts/clients — distinct client names for autocomplete (MUST be before /:id routes)
router.get('/clients', async (req, res) => {
  try {
    const { gameId } = req.query;
    let q = `
      SELECT DISTINCT c.client_name
      FROM contracts c
      JOIN runs r ON c.run_id = r.id
      WHERE c.client_name IS NOT NULL AND c.client_name != ''
    `;
    const args: unknown[] = [];
    if (gameId) { q += ' AND r.game_id = ?'; args.push(gameId); }
    q += ' ORDER BY c.client_name';
    const rows = await db.all(q, args);
    res.json(rows.map((r: any) => r.client_name));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/run/:runId', async (req, res) => {
  try {
    res.json(await db.all('SELECT * FROM contracts WHERE run_id = ? ORDER BY id', [req.params.runId]));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/', async (req, res) => {
  try {
    const { gameId, status, type } = req.query;
    let q = `
      SELECT c.*, r.title as run_title, r.game_id, g.name as game_name, g.currency
      FROM contracts c
      JOIN runs r ON c.run_id = r.id
      JOIN games g ON r.game_id = g.id
      WHERE 1=1
    `;
    const args: unknown[] = [];
    if (gameId) { q += ' AND r.game_id = ?'; args.push(gameId); }
    if (status) { q += ' AND c.status = ?'; args.push(status); }
    if (type) { q += ' AND c.type = ?'; args.push(type); }
    q += ' ORDER BY c.id DESC';
    res.json(await db.all(q, args));
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  const { runId, type, clientName, description, agreedPayout, bonusPayout,
          cargoType, scuAmount, pickupLocation, deliveryLocation,
          isShared, sharedPlayerCount } = req.body;
  if (!runId || !type || agreedPayout == null) {
    return res.status(400).json({ error: 'runId, type, agreedPayout required' });
  }
  try {
    const result = await db.run(
      `INSERT INTO contracts
         (run_id, type, client_name, description, agreed_payout, bonus_payout,
          cargo_type, scu_amount, pickup_location, delivery_location,
          is_shared, shared_player_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [runId, type, clientName ?? null, description ?? null, agreedPayout, bonusPayout ?? 0,
       cargoType ?? null, scuAmount ?? null, pickupLocation ?? null, deliveryLocation ?? null,
       isShared ? 1 : 0, sharedPlayerCount ?? null]
    );
    const contractId = result.lastInsertRowid;

    // Auto-populate contract_crew from run's current crew
    const runCrew = await db.all('SELECT * FROM run_crew WHERE run_id = ?', [runId]);
    for (const member of runCrew as any[]) {
      await db.run(
        'INSERT INTO contract_crew (contract_id, crew_member_id, role, payout_type, payout_value) VALUES (?, ?, ?, ?, ?)',
        [contractId, member.crew_member_id, member.role ?? null, member.payout_type ?? 'percentage', member.payout_value ?? 0]
      );
    }

    res.status(201).json({ id: contractId });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', async (req, res) => {
  const { type, clientName, description, agreedPayout, bonusPayout, status, completedAt,
          cargoType, scuAmount, pickupLocation, deliveryLocation,
          isShared, sharedPlayerCount } = req.body;
  try {
    await db.run(`
      UPDATE contracts SET
        type                = COALESCE(?, type),
        client_name         = COALESCE(?, client_name),
        description         = COALESCE(?, description),
        agreed_payout       = COALESCE(?, agreed_payout),
        bonus_payout        = COALESCE(?, bonus_payout),
        status              = COALESCE(?, status),
        completed_at        = COALESCE(?, completed_at),
        cargo_type          = COALESCE(?, cargo_type),
        scu_amount          = COALESCE(?, scu_amount),
        pickup_location     = COALESCE(?, pickup_location),
        delivery_location   = COALESCE(?, delivery_location),
        is_shared           = COALESCE(?, is_shared),
        shared_player_count = COALESCE(?, shared_player_count)
      WHERE id = ?
    `, [type ?? null, clientName ?? null, description ?? null, agreedPayout ?? null,
        bonusPayout ?? null, status ?? null, completedAt ?? null,
        cargoType ?? null, scuAmount ?? null, pickupLocation ?? null, deliveryLocation ?? null,
        isShared != null ? (isShared ? 1 : 0) : null, sharedPlayerCount ?? null,
        req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/complete', async (req, res) => {
  const { bonusPayout } = req.body;
  try {
    await db.run(
      "UPDATE contracts SET status = 'complete', completed_at = datetime('now'), bonus_payout = COALESCE(?, bonus_payout) WHERE id = ?",
      [bonusPayout ?? null, req.params.id]
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM contracts WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── Per-contract crew ──────────────────────────────────────────────────────────

router.get('/:id/crew', async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT cc.*, cm.name as member_name, cm.game_handle
      FROM contract_crew cc
      JOIN crew_members cm ON cc.crew_member_id = cm.id
      WHERE cc.contract_id = ?
    `, [req.params.id]);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/crew', async (req, res) => {
  const { crewMemberId, role, payoutType = 'percentage', payoutValue = 0 } = req.body;
  if (!crewMemberId) return res.status(400).json({ error: 'crewMemberId required' });
  try {
    const result = await db.run(
      'INSERT INTO contract_crew (contract_id, crew_member_id, role, payout_type, payout_value) VALUES (?, ?, ?, ?, ?)',
      [req.params.id, crewMemberId, role ?? null, payoutType, payoutValue]
    );
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/:id/crew/:rowId', async (req, res) => {
  const { role, payoutType, payoutValue, payoutSettled, actualPayout } = req.body;
  try {
    await db.run(`
      UPDATE contract_crew SET
        role           = COALESCE(?, role),
        payout_type    = COALESCE(?, payout_type),
        payout_value   = COALESCE(?, payout_value),
        payout_settled = COALESCE(?, payout_settled),
        actual_payout  = COALESCE(?, actual_payout)
      WHERE id = ? AND contract_id = ?
    `, [role ?? null, payoutType ?? null, payoutValue ?? null, payoutSettled ?? null, actualPayout ?? null,
        req.params.rowId, req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id/crew/:rowId', async (req, res) => {
  try {
    await db.run('DELETE FROM contract_crew WHERE id = ? AND contract_id = ?', [req.params.rowId, req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
