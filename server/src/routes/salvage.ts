import { Router } from 'express';
import { routeError } from '../lib/routeError';
import { db } from '../db';
import { inventoryIn } from '../lib/inventory';

const router = Router();

// ─── Per-run pipeline ─────────────────────────────────────────────────────────
router.get('/run/:runId', async (req, res) => {
  try {
    const hauls = await db.all(
      'SELECT * FROM salvage_hauls WHERE run_id = ? ORDER BY id',
      [req.params.runId],
    );
    const result = await Promise.all((hauls as any[]).map(async (h: any) => ({
      ...h,
      lines: await db.all('SELECT * FROM salvage_lines WHERE haul_id = ? ORDER BY id', [h.id]),
    })));
    res.json(result);
  } catch (e: unknown) { routeError(res, e); }
});

// ─── All hauls (standalone Salvaging page) ────────────────────────────────────
router.get('/hauls', async (req, res) => {
  try {
    const { gameId } = req.query;
    const gId = gameId ? Number(gameId) : null;
    const hauls = await db.all(`
      SELECT sh.*, r.game_id, r.title AS run_title, g.name AS game_name, g.currency
      FROM   salvage_hauls sh
      JOIN   runs r  ON sh.run_id  = r.id
      JOIN   games g ON r.game_id  = g.id
      ${gId ? 'WHERE r.game_id = ?' : ''}
      ORDER  BY sh.committed ASC, sh.id DESC
    `, gId ? [gId] : []);
    const result = await Promise.all((hauls as any[]).map(async (h: any) => ({
      ...h,
      lines: await db.all('SELECT * FROM salvage_lines WHERE haul_id = ? ORDER BY id', [h.id]),
    })));
    res.json(result);
  } catch (e: unknown) { routeError(res, e); }
});

// ─── Hauls CRUD ───────────────────────────────────────────────────────────────
router.post('/hauls', async (req, res) => {
  const { runId, label, notes } = req.body;
  if (!runId || !label) return res.status(400).json({ error: 'runId and label required' });
  try {
    const r = await db.run(
      'INSERT INTO salvage_hauls (run_id, label, notes) VALUES (?, ?, ?)',
      [runId, label, notes ?? null],
    );
    res.status(201).json({ id: r.lastInsertRowid });
  } catch (e: unknown) { routeError(res, e); }
});

router.put('/hauls/:id', async (req, res) => {
  const { label, notes } = req.body;
  try {
    await db.run(
      'UPDATE salvage_hauls SET label = COALESCE(?, label), notes = COALESCE(?, notes) WHERE id = ?',
      [label ?? null, notes ?? null, req.params.id],
    );
    res.json({ ok: true });
  } catch (e: unknown) { routeError(res, e); }
});

router.delete('/hauls/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM salvage_hauls WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e: unknown) { routeError(res, e); }
});

// ─── Commit: check-in haul → auto-stock inventory ─────────────────────────────
router.post('/hauls/:id/commit', async (req, res) => {
  const { location } = req.body;
  try {
    const haul = await db.get(
      `SELECT sh.*, r.game_id FROM salvage_hauls sh
       JOIN runs r ON sh.run_id = r.id WHERE sh.id = ?`,
      [req.params.id],
    );
    if (!haul) return res.status(404).json({ error: 'Haul not found' });

    const lines = await db.all(
      'SELECT * FROM salvage_lines WHERE haul_id = ?',
      [req.params.id],
    );
    for (const line of lines as any[]) {
      if ((line.quantity_scu ?? 0) > 0) {
        await inventoryIn(
          haul.game_id,
          line.material,
          line.quantity_scu,
          haul.run_id,
          null,
          `Salvaged: ${line.material}`,
        );
      }
    }

    await db.run(
      `UPDATE salvage_hauls
         SET committed = 1, committed_location = ?, committed_at = ?
       WHERE id = ?`,
      [location ?? null, new Date().toISOString(), req.params.id],
    );
    res.json({ ok: true });
  } catch (e: unknown) { routeError(res, e); }
});

// Uncommit — does NOT reverse inventory (user manages that manually)
router.delete('/hauls/:id/commit', async (req, res) => {
  try {
    await db.run(
      `UPDATE salvage_hauls
         SET committed = 0, committed_location = NULL, committed_at = NULL
       WHERE id = ?`,
      [req.params.id],
    );
    res.json({ ok: true });
  } catch (e: unknown) { routeError(res, e); }
});

// ─── Salvage lines ────────────────────────────────────────────────────────────
router.post('/hauls/:haulId/lines', async (req, res) => {
  const { runId, material, quantityScu } = req.body;
  if (!runId || !material || quantityScu == null) {
    return res.status(400).json({ error: 'runId, material, quantityScu required' });
  }
  try {
    const r = await db.run(
      'INSERT INTO salvage_lines (haul_id, run_id, material, quantity_scu) VALUES (?, ?, ?, ?)',
      [req.params.haulId, runId, material, quantityScu],
    );
    res.status(201).json({ id: r.lastInsertRowid });
  } catch (e: unknown) { routeError(res, e); }
});

router.put('/lines/:id', async (req, res) => {
  const { material, quantityScu } = req.body;
  try {
    await db.run(
      `UPDATE salvage_lines SET
         material     = COALESCE(?, material),
         quantity_scu = COALESCE(?, quantity_scu)
       WHERE id = ?`,
      [material ?? null, quantityScu ?? null, req.params.id],
    );
    res.json({ ok: true });
  } catch (e: unknown) { routeError(res, e); }
});

router.delete('/lines/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM salvage_lines WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e: unknown) { routeError(res, e); }
});

export default router;
