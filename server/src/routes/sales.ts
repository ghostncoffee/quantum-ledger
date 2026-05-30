import { Router } from 'express';
import { routeError } from '../lib/routeError';
import { db } from '../db';
import { inventoryOut } from '../lib/inventory';

const router = Router();

router.get('/run/:runId', async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM sales WHERE run_id = ? ORDER BY sold_at DESC', [req.params.runId]);
    res.json(rows);
  } catch (e: unknown) { routeError(res, e); }
});

router.post('/', async (req, res) => {
  const { runId, refiningJobId, tradingEntryId, contractId, commodity, quantitySold, pricePerUnit, location, soldAt } = req.body;
  if (!commodity || quantitySold == null || pricePerUnit == null) {
    return res.status(400).json({ error: 'commodity, quantitySold, pricePerUnit required' });
  }
  try {
    const totalRevenue = quantitySold * pricePerUnit;
    const result = await db.run(`
      INSERT INTO sales (run_id, refining_job_id, trading_entry_id, contract_id, commodity, quantity_sold, price_per_unit, total_revenue, location, sold_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [runId ?? null, refiningJobId ?? null, tradingEntryId ?? null, contractId ?? null,
        commodity, quantitySold, pricePerUnit, totalRevenue,
        location ?? null, soldAt ?? new Date().toISOString()]);

    if (tradingEntryId) {
      const te = await db.get('SELECT quantity_bought FROM trading_entries WHERE id = ?', [tradingEntryId]);
      if (te) {
        const sold = await db.get('SELECT COALESCE(SUM(quantity_sold),0) as t FROM sales WHERE trading_entry_id = ?', [tradingEntryId]);
        const status = (sold?.t ?? 0) >= te.quantity_bought ? 'sold' : 'partial';
        await db.run('UPDATE trading_entries SET status = ? WHERE id = ?', [status, tradingEntryId]);
      }
    }

    // Auto-reduce inventory for the commodity sold
    if (runId) {
      const run = await db.get('SELECT game_id FROM runs WHERE id = ?', [runId]);
      if (run) {
        await inventoryOut(run.game_id, commodity, quantitySold, runId, `Sold: ${commodity}`);
      }
    }

    res.status(201).json({ id: result.lastInsertRowid, totalRevenue });
  } catch (e: unknown) { routeError(res, e); }
});

router.put('/:id', async (req, res) => {
  const { commodity, quantitySold, pricePerUnit, location, soldAt } = req.body;
  const totalRevenue = (quantitySold != null && pricePerUnit != null) ? quantitySold * pricePerUnit : null;
  try {
    await db.run(`
      UPDATE sales SET
        commodity = COALESCE(?, commodity),
        quantity_sold = COALESCE(?, quantity_sold),
        price_per_unit = COALESCE(?, price_per_unit),
        total_revenue = COALESCE(?, total_revenue),
        location = COALESCE(?, location),
        sold_at = COALESCE(?, sold_at)
      WHERE id = ?
    `, [commodity ?? null, quantitySold ?? null, pricePerUnit ?? null, totalRevenue, location ?? null, soldAt ?? null, req.params.id]);
    res.json({ ok: true });
  } catch (e: unknown) { routeError(res, e); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM sales WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e: unknown) { routeError(res, e); }
});

export default router;
