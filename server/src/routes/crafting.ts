import { Router } from 'express';
import { routeError } from '../lib/routeError';
import { db } from '../db';

const router = Router();

// ─── Standalone: all crafting jobs (no run required) ─────────────────────────
router.get('/jobs', async (req, res) => {
  try {
    const { gameId } = req.query;
    const gId = gameId ? Number(gameId) : null;

    const jobs = await db.all(`
      SELECT cj.*,
        (SELECT COALESCE(SUM(ci.total_cost), 0) FROM crafting_inputs ci WHERE ci.crafting_job_id = cj.id) as total_input_cost,
        r.title as run_title,
        COALESCE(r.game_id, cj.game_id) as resolved_game_id,
        g.name as game_name, g.currency
      FROM crafting_jobs cj
      LEFT JOIN runs r ON cj.run_id = r.id
      LEFT JOIN games g ON COALESCE(r.game_id, cj.game_id) = g.id
      ${gId ? 'WHERE COALESCE(r.game_id, cj.game_id) = ?' : ''}
      ORDER BY cj.id DESC
    `, gId ? [gId] : []);

    const result = await Promise.all((jobs as any[]).map(async (job: any) => {
      const inputs = await db.all('SELECT * FROM crafting_inputs WHERE crafting_job_id = ?', [job.id]);
      return { ...job, inputs };
    }));

    res.json(result);
  } catch (e: unknown) { routeError(res, e); }
});

// ─── Run-scoped: jobs for a specific run ─────────────────────────────────────
router.get('/run/:runId', async (req, res) => {
  try {
    const jobs = await db.all(`
      SELECT cj.*,
        (SELECT COALESCE(SUM(ci.total_cost), 0) FROM crafting_inputs ci WHERE ci.crafting_job_id = cj.id) as total_input_cost
      FROM crafting_jobs cj WHERE cj.run_id = ?
    `, [req.params.runId]);

    const result = await Promise.all(jobs.map(async (job: any) => {
      const inputs = await db.all('SELECT * FROM crafting_inputs WHERE crafting_job_id = ?', [job.id]);
      return { ...job, inputs };
    }));

    res.json(result);
  } catch (e: unknown) { routeError(res, e); }
});

router.post('/jobs', async (req, res) => {
  const { runId, gameId, outputItem, outputQuantity, estimatedValue } = req.body;
  if (!outputItem || outputQuantity == null || (!runId && !gameId)) {
    return res.status(400).json({ error: 'outputItem, outputQuantity, and either runId or gameId required' });
  }
  try {
    const result = await db.run(
      'INSERT INTO crafting_jobs (run_id, game_id, output_item, output_quantity, estimated_value) VALUES (?, ?, ?, ?, ?)',
      [runId ?? null, gameId ?? null, outputItem, outputQuantity, estimatedValue ?? null]
    );
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e: unknown) { routeError(res, e); }
});

router.put('/jobs/:id', async (req, res) => {
  const { outputItem, outputQuantity, estimatedValue, status, completedAt } = req.body;
  try {
    await db.run(`
      UPDATE crafting_jobs SET
        output_item = COALESCE(?, output_item),
        output_quantity = COALESCE(?, output_quantity),
        estimated_value = COALESCE(?, estimated_value),
        status = COALESCE(?, status),
        completed_at = COALESCE(?, completed_at)
      WHERE id = ?
    `, [outputItem ?? null, outputQuantity ?? null, estimatedValue ?? null, status ?? null, completedAt ?? null, req.params.id]);
    res.json({ ok: true });
  } catch (e: unknown) { routeError(res, e); }
});

router.delete('/jobs/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM crafting_jobs WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e: unknown) { routeError(res, e); }
});

router.post('/jobs/:jobId/inputs', async (req, res) => {
  const { material, quantityRequired, costPerUnit } = req.body;
  if (!material || quantityRequired == null) {
    return res.status(400).json({ error: 'material and quantityRequired required' });
  }
  try {
    const totalCost = costPerUnit != null ? quantityRequired * costPerUnit : null;
    const result = await db.run(
      'INSERT INTO crafting_inputs (crafting_job_id, material, quantity_required, cost_per_unit, total_cost) VALUES (?, ?, ?, ?, ?)',
      [req.params.jobId, material, quantityRequired, costPerUnit ?? null, totalCost]
    );
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e: unknown) { routeError(res, e); }
});

router.put('/inputs/:id', async (req, res) => {
  const { material, quantityRequired, quantityUsed, costPerUnit } = req.body;
  const totalCost = (quantityRequired != null && costPerUnit != null) ? quantityRequired * costPerUnit : null;
  try {
    await db.run(`
      UPDATE crafting_inputs SET
        material = COALESCE(?, material),
        quantity_required = COALESCE(?, quantity_required),
        quantity_used = COALESCE(?, quantity_used),
        cost_per_unit = COALESCE(?, cost_per_unit),
        total_cost = COALESCE(?, total_cost)
      WHERE id = ?
    `, [material ?? null, quantityRequired ?? null, quantityUsed ?? null, costPerUnit ?? null, totalCost, req.params.id]);
    res.json({ ok: true });
  } catch (e: unknown) { routeError(res, e); }
});

router.delete('/inputs/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM crafting_inputs WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e: unknown) { routeError(res, e); }
});

export default router;
