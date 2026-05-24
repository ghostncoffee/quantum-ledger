import { Router } from 'express';
import { db } from '../db';
import { inventoryIn } from '../lib/inventory';

const router = Router();

// ─── Pipeline: entries + bags + refining + sales for a run ────────────────────
router.get('/run/:runId', async (req, res) => {
  try {
    const { runId } = req.params;

    // Legacy raw-ore entries (kept for backward compat)
    const entries = await db.all(`
      SELECT me.*,
        (SELECT COALESCE(SUM(rj.cost_to_refine), 0)
           FROM refining_jobs rj WHERE rj.mining_entry_id = me.id) as refining_cost,
        (SELECT COALESCE(SUM(s.total_revenue), 0)
           FROM sales s
           JOIN refining_jobs rj ON s.refining_job_id = rj.id
           WHERE rj.mining_entry_id = me.id) as revenue
      FROM mining_entries me
      WHERE me.run_id = ?
      ORDER BY me.id
    `, [runId]);

    // Bags
    const bags = await db.all(
      'SELECT * FROM mining_bags WHERE run_id = ? ORDER BY id',
      [runId]
    );

    // All ore lines for this run, then group into bags
    const lines = bags.length > 0
      ? await db.all('SELECT * FROM mining_ore_lines WHERE run_id = ? ORDER BY bag_id, id', [runId])
      : [];
    const bagsWithLines = (bags as any[]).map((b: any) => ({
      ...b,
      lines: (lines as any[]).filter((l: any) => l.bag_id === b.id),
    }));

    // Refining jobs — covers both legacy (mining_entry_id) and bag-linked (bag_id)
    const refiningJobs = await db.all(`
      SELECT rj.*,
        COALESCE(mb.label, me.raw_material) as source_label,
        (SELECT COALESCE(SUM(s.total_revenue), 0) FROM sales s WHERE s.refining_job_id = rj.id) as sale_revenue
      FROM refining_jobs rj
      LEFT JOIN mining_entries me ON rj.mining_entry_id = me.id
      LEFT JOIN mining_bags mb ON rj.bag_id = mb.id
      WHERE me.run_id = ? OR mb.run_id = ?
      ORDER BY rj.id
    `, [runId, runId]);

    // Sales linked to those refining jobs
    let linkedSales: any[] = [];
    if ((refiningJobs as any[]).length > 0) {
      const rjIds = (refiningJobs as any[]).map((r: any) => r.id);
      const ph = rjIds.map(() => '?').join(',');
      linkedSales = await db.all(
        `SELECT * FROM sales WHERE refining_job_id IN (${ph})`,
        rjIds
      );
    }

    // Direct (non-refining) sales on this run
    const directSales = await db.all(
      'SELECT * FROM sales WHERE run_id = ? AND refining_job_id IS NULL ORDER BY sold_at DESC',
      [runId]
    );

    res.json({
      entries,
      bags: bagsWithLines,
      refiningJobs,
      sales: [...linkedSales, ...directSales],
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Bags ─────────────────────────────────────────────────────────────────────
router.post('/bags', async (req, res) => {
  const { runId, label, capacityScu, notes } = req.body;
  if (!runId || !label) return res.status(400).json({ error: 'runId and label required' });
  try {
    const result = await db.run(
      'INSERT INTO mining_bags (run_id, label, capacity_scu, notes) VALUES (?, ?, ?, ?)',
      [runId, label, capacityScu ?? null, notes ?? null]
    );
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/bags/:id', async (req, res) => {
  const { label, capacityScu, notes } = req.body;
  try {
    await db.run(
      `UPDATE mining_bags SET
        label = COALESCE(?, label),
        capacity_scu = COALESCE(?, capacity_scu),
        notes = COALESCE(?, notes)
       WHERE id = ?`,
      [label ?? null, capacityScu ?? null, notes ?? null, req.params.id]
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/bags/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM mining_bags WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Commit a bag to a location (check-in at station / refinery)
router.post('/bags/:id/commit', async (req, res) => {
  const { location } = req.body;
  try {
    await db.run(
      `UPDATE mining_bags SET committed = 1, committed_location = ?, committed_at = ? WHERE id = ?`,
      [location ?? null, new Date().toISOString(), req.params.id]
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Uncommit — bag goes back to "in the field"
router.delete('/bags/:id/commit', async (req, res) => {
  try {
    await db.run(
      `UPDATE mining_bags SET committed = 0, committed_location = NULL, committed_at = NULL WHERE id = ?`,
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Ore lines ────────────────────────────────────────────────────────────────
router.post('/bags/:bagId/lines', async (req, res) => {
  const { bagId } = req.params;
  const { runId, material, scu, quality, isInert } = req.body;
  if (!runId || !material || scu == null) {
    return res.status(400).json({ error: 'runId, material, scu required' });
  }
  try {
    const result = await db.run(
      'INSERT INTO mining_ore_lines (bag_id, run_id, material, scu, quality, is_inert) VALUES (?, ?, ?, ?, ?, ?)',
      [bagId, runId, material, scu, quality ?? null, isInert ? 1 : 0]
    );
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/lines/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM mining_ore_lines WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Legacy entries ───────────────────────────────────────────────────────────
router.post('/entries', async (req, res) => {
  const { runId, rawMaterial, quantityRaw, location, notes } = req.body;
  if (!runId || !rawMaterial || quantityRaw == null) {
    return res.status(400).json({ error: 'runId, rawMaterial, quantityRaw required' });
  }
  try {
    const result = await db.run(
      'INSERT INTO mining_entries (run_id, raw_material, quantity_raw, location, notes) VALUES (?, ?, ?, ?, ?)',
      [runId, rawMaterial, quantityRaw, location ?? null, notes ?? null]
    );
    const run = await db.get('SELECT game_id FROM runs WHERE id = ?', [runId]);
    if (run) {
      await inventoryIn(run.game_id, rawMaterial, quantityRaw, runId, null, `Mined: ${rawMaterial}`);
    }
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/entries/:id', async (req, res) => {
  const { rawMaterial, quantityRaw, location, notes } = req.body;
  try {
    await db.run(
      `UPDATE mining_entries SET
        raw_material = COALESCE(?, raw_material),
        quantity_raw = COALESCE(?, quantity_raw),
        location = COALESCE(?, location),
        notes = COALESCE(?, notes)
       WHERE id = ?`,
      [rawMaterial ?? null, quantityRaw ?? null, location ?? null, notes ?? null, req.params.id]
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/entries/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM mining_entries WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Refining jobs ────────────────────────────────────────────────────────────

// All refining jobs across all runs (must come before /:id routes)
router.get('/refining/all', async (req, res) => {
  try {
    const { gameId } = req.query;
    const gId = gameId ? Number(gameId) : null;

    const jobs = await db.all(`
      SELECT rj.*,
        COALESCE(mb.label, me.raw_material, 'Standalone') as source_label,
        COALESCE(mb.committed_location, me.location, rj.refinery_name) as station,
        COALESCE(me.run_id, mb.run_id) as run_id,
        r.title as run_title,
        g.name as game_name, g.currency,
        (SELECT COALESCE(SUM(s.total_revenue), 0) FROM sales s WHERE s.refining_job_id = rj.id) as sale_revenue
      FROM refining_jobs rj
      LEFT JOIN mining_entries me ON rj.mining_entry_id = me.id
      LEFT JOIN mining_bags mb ON rj.bag_id = mb.id
      LEFT JOIN runs r ON COALESCE(me.run_id, mb.run_id) = r.id
      LEFT JOIN games g ON r.game_id = g.id
      ${gId ? 'WHERE (r.game_id = ? OR (r.id IS NULL AND ? IS NOT NULL))' : ''}
      ORDER BY rj.id DESC
    `, gId ? [gId, gId] : []);

    res.json(jobs);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/refining', async (req, res) => {
  const { miningEntryId, bagId, refineryName, refineryMethod, inputQuantity, outputMaterial, costToRefine, startedAt } = req.body;
  if (!inputQuantity || !outputMaterial) {
    return res.status(400).json({ error: 'inputQuantity and outputMaterial required' });
  }
  try {
    const result = await db.run(
      `INSERT INTO refining_jobs
        (mining_entry_id, bag_id, refinery_name, refinery_method, input_quantity,
         output_material, cost_to_refine, started_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        miningEntryId ?? null,
        bagId ?? null,
        refineryName ?? null,
        refineryMethod ?? null,
        inputQuantity,
        outputMaterial,
        costToRefine ?? 0,
        startedAt ?? null,
        'pending',
      ]
    );
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/refining/:id', async (req, res) => {
  const { refineryName, refineryMethod, outputMaterial, inputQuantity, outputQuantity, efficiency, costToRefine, completedAt, status } = req.body;
  try {
    await db.run(`
      UPDATE refining_jobs SET
        refinery_name    = COALESCE(?, refinery_name),
        refinery_method  = COALESCE(?, refinery_method),
        output_material  = COALESCE(?, output_material),
        input_quantity   = COALESCE(?, input_quantity),
        output_quantity  = COALESCE(?, output_quantity),
        efficiency       = COALESCE(?, efficiency),
        cost_to_refine   = COALESCE(?, cost_to_refine),
        completed_at     = COALESCE(?, completed_at),
        status           = COALESCE(?, status)
      WHERE id = ?
    `, [refineryName ?? null, refineryMethod ?? null, outputMaterial ?? null, inputQuantity ?? null,
        outputQuantity ?? null, efficiency ?? null, costToRefine ?? null,
        completedAt ?? null, status ?? null, req.params.id]);

    // When refining completes, add refined material to inventory
    if (status === 'done' && outputQuantity != null) {
      const rj = await db.get(`
        SELECT rj.output_material,
               COALESCE(me.run_id, mb.run_id) as run_id,
               COALESCE(r1.game_id, r2.game_id) as game_id
        FROM refining_jobs rj
        LEFT JOIN mining_entries me ON rj.mining_entry_id = me.id
        LEFT JOIN runs r1 ON me.run_id = r1.id
        LEFT JOIN mining_bags mb ON rj.bag_id = mb.id
        LEFT JOIN runs r2 ON mb.run_id = r2.id
        WHERE rj.id = ?
      `, [req.params.id]);
      if (rj) {
        await inventoryIn(rj.game_id, rj.output_material, outputQuantity, rj.run_id, null, `Refined: ${rj.output_material}`);
      }
    }

    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/refining/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM refining_jobs WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── Committed bags for inventory view ────────────────────────────────────────
router.get('/committed', async (req, res) => {
  try {
    const { gameId } = req.query;
    const gId = gameId ? Number(gameId) : null;

    const bags = await db.all(`
      SELECT mb.*, r.game_id, r.title as run_title, g.name as game_name, g.currency
      FROM mining_bags mb
      JOIN runs r ON mb.run_id = r.id
      JOIN games g ON r.game_id = g.id
      WHERE mb.committed = 1
        ${gId ? 'AND r.game_id = ?' : ''}
      ORDER BY mb.committed_location, mb.id
    `, gId ? [gId] : []);

    const result = await Promise.all((bags as any[]).map(async (bag: any) => {
      const lines = await db.all(
        'SELECT * FROM mining_ore_lines WHERE bag_id = ? ORDER BY id',
        [bag.id]
      );
      return { ...bag, lines };
    }));

    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
