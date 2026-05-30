import { Router } from 'express';
import { routeError } from '../lib/routeError';
import { db } from '../db';

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Recalculate and update the parent job's status based on its legs. */
async function syncJobStatus(jobId: number) {
  const legs = await db.all('SELECT status FROM hauling_legs WHERE job_id = ?', [jobId]);
  if ((legs as any[]).length === 0) return; // no legs → don't touch job status
  const all   = legs as any[];
  const allDone   = all.every((l: any) => l.status === 'delivered');
  const anyActive = all.some((l: any) => l.status === 'in_transit' || l.status === 'delivered');
  if (allDone) {
    await db.run(
      `UPDATE hauling_jobs SET status = 'delivered', completed_at = COALESCE(completed_at, ?) WHERE id = ?`,
      [new Date().toISOString(), jobId]
    );
  } else if (anyActive) {
    await db.run(
      `UPDATE hauling_jobs SET status = 'in_transit' WHERE id = ? AND status = 'pending'`,
      [jobId]
    );
  }
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

router.get('/run/:runId', async (req, res) => {
  try {
    const jobs = await db.all(
      'SELECT * FROM hauling_jobs WHERE run_id = ? ORDER BY id',
      [req.params.runId]
    );
    if ((jobs as any[]).length === 0) return res.json([]);

    const ids = (jobs as any[]).map((j: any) => j.id);
    const ph  = ids.map(() => '?').join(',');
    const legs = await db.all(
      `SELECT * FROM hauling_legs WHERE job_id IN (${ph}) ORDER BY id`,
      ids
    );

    const byJob: Record<number, any[]> = {};
    for (const l of legs as any[]) {
      (byJob[l.job_id] = byJob[l.job_id] || []).push(l);
    }

    res.json((jobs as any[]).map((j: any) => ({ ...j, legs: byJob[j.id] || [] })));
  } catch (e: unknown) { routeError(res, e); }
});

router.post('/', async (req, res) => {
  const { runId, agreedPayout, bonusPayout, notes, legs,
          // legacy single-leg fields (kept for backward compat)
          cargoType, scuAmount, pickupLocation, deliveryLocation } = req.body;
  if (!runId || agreedPayout == null) {
    return res.status(400).json({ error: 'runId and agreedPayout required' });
  }
  try {
    const result = await db.run(
      `INSERT INTO hauling_jobs (run_id, agreed_payout, bonus_payout, notes, pickup_location, delivery_location)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [runId, agreedPayout, bonusPayout ?? 0, notes ?? null, pickupLocation ?? null, deliveryLocation ?? null]
    );
    const jobId = result.lastInsertRowid;

    if (Array.isArray(legs) && legs.length > 0) {
      // Multi-leg path
      for (const leg of legs) {
        await db.run(
          `INSERT INTO hauling_legs (job_id, cargo_type, quantity, scu_amount, pickup_location, dropoff_location, status)
           VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
          [jobId, leg.cargoType ?? null, leg.quantity ?? null, leg.scuAmount ?? null,
           leg.pickupLocation ?? null, leg.dropoffLocation ?? null]
        );
      }
    } else if (cargoType || scuAmount || pickupLocation || deliveryLocation) {
      // Legacy single-leg — convert to a leg row so everything is uniform
      await db.run(
        `INSERT INTO hauling_legs (job_id, cargo_type, quantity, scu_amount, pickup_location, dropoff_location, status)
         VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
        [jobId, cargoType ?? null, null, scuAmount ?? null, pickupLocation ?? null, deliveryLocation ?? null]
      );
    }

    res.status(201).json({ id: jobId });
  } catch (e: unknown) { routeError(res, e); }
});

router.put('/:id', async (req, res) => {
  const { agreedPayout, bonusPayout, notes, status,
          // legacy fields still accepted
          cargoType, scuAmount, pickupLocation, deliveryLocation } = req.body;
  try {
    const completedAt = status === 'delivered' ? new Date().toISOString() : null;
    await db.run(`
      UPDATE hauling_jobs SET
        cargo_type        = COALESCE(?, cargo_type),
        scu_amount        = COALESCE(?, scu_amount),
        pickup_location   = COALESCE(?, pickup_location),
        delivery_location = COALESCE(?, delivery_location),
        agreed_payout     = COALESCE(?, agreed_payout),
        bonus_payout      = COALESCE(?, bonus_payout),
        notes             = COALESCE(?, notes),
        status            = COALESCE(?, status),
        completed_at      = COALESCE(completed_at, ?)
      WHERE id = ?
    `, [cargoType ?? null, scuAmount ?? null, pickupLocation ?? null, deliveryLocation ?? null,
        agreedPayout ?? null, bonusPayout ?? null, notes ?? null, status ?? null,
        completedAt, req.params.id]);
    res.json({ ok: true });
  } catch (e: unknown) { routeError(res, e); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM hauling_jobs WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e: unknown) { routeError(res, e); }
});

// ─── Legs ─────────────────────────────────────────────────────────────────────

router.post('/jobs/:jobId/legs', async (req, res) => {
  const { cargoType, quantity, scuAmount, pickupLocation, dropoffLocation } = req.body;
  try {
    const result = await db.run(
      `INSERT INTO hauling_legs (job_id, cargo_type, quantity, scu_amount, pickup_location, dropoff_location, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [req.params.jobId, cargoType ?? null, quantity ?? null, scuAmount ?? null,
       pickupLocation ?? null, dropoffLocation ?? null]
    );
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e: unknown) { routeError(res, e); }
});

router.put('/legs/:id', async (req, res) => {
  const { cargoType, quantity, scuAmount, pickupLocation, dropoffLocation, status } = req.body;
  try {
    const completedAt = status === 'delivered' ? new Date().toISOString() : null;
    await db.run(`
      UPDATE hauling_legs SET
        cargo_type       = COALESCE(?, cargo_type),
        quantity         = COALESCE(?, quantity),
        scu_amount       = COALESCE(?, scu_amount),
        pickup_location  = COALESCE(?, pickup_location),
        dropoff_location = COALESCE(?, dropoff_location),
        status           = COALESCE(?, status),
        completed_at     = COALESCE(completed_at, ?)
      WHERE id = ?
    `, [cargoType ?? null, quantity ?? null, scuAmount ?? null, pickupLocation ?? null,
        dropoffLocation ?? null, status ?? null, completedAt, req.params.id]);

    // Sync parent job status
    const leg = await db.get('SELECT job_id FROM hauling_legs WHERE id = ?', [req.params.id]);
    if (leg) await syncJobStatus(leg.job_id);

    res.json({ ok: true });
  } catch (e: unknown) { routeError(res, e); }
});

router.delete('/legs/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM hauling_legs WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e: unknown) { routeError(res, e); }
});

export default router;
