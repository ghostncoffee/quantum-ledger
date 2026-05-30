import { Router } from 'express';
import { routeError } from '../lib/routeError';
import { db } from '../db';
import { inventoryIn, inventoryOut } from '../lib/inventory';

const router = Router();

router.get('/run/:runId', async (req, res) => {
  try {
    const entries = await db.all(`
      SELECT te.*,
        (SELECT COALESCE(SUM(s.total_revenue), 0) FROM sales s WHERE s.trading_entry_id = te.id) as revenue,
        (SELECT COALESCE(SUM(s.quantity_sold), 0) FROM sales s WHERE s.trading_entry_id = te.id) as sold_quantity
      FROM trading_entries te
      WHERE te.run_id = ?
      ORDER BY te.id
    `, [req.params.runId]);
    res.json(entries);
  } catch (e: unknown) { routeError(res, e); }
});

router.post('/', async (req, res) => {
  const { runId, commodity, quantityBought, boxQuantity, scuPerBox, buyPricePerUnit, buyLocation, sellLocation } = req.body;
  if (!runId || !commodity || buyPricePerUnit == null) {
    return res.status(400).json({ error: 'runId, commodity, buyPricePerUnit required' });
  }
  // Derive total quantity: prefer box×scu calculation, fall back to raw quantityBought
  const totalQty: number = (boxQuantity != null && scuPerBox != null)
    ? Number(boxQuantity) * Number(scuPerBox)
    : Number(quantityBought ?? 0);
  if (!totalQty) return res.status(400).json({ error: 'Quantity required (either boxQuantity+scuPerBox or quantityBought)' });
  try {
    // Total cost = boxes × price_per_box (price is per box/container, not per SCU)
    const totalCost = (boxQuantity != null ? Number(boxQuantity) : totalQty) * Number(buyPricePerUnit);
    const result = await db.run(
      `INSERT INTO trading_entries
         (run_id, commodity, quantity_bought, box_quantity, scu_per_box, buy_price_per_unit, total_cost, buy_location, sell_location)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [runId, commodity, totalQty, boxQuantity ?? null, scuPerBox ?? null,
       buyPricePerUnit, totalCost, buyLocation ?? null, sellLocation ?? null]
    );

    // Auto-track purchase in inventory — use per-SCU cost for inventory valuation
    const run = await db.get('SELECT game_id FROM runs WHERE id = ?', [runId]);
    if (run) {
      const costPerScu = (boxQuantity != null && scuPerBox != null && Number(scuPerBox) > 0)
        ? Number(buyPricePerUnit) / Number(scuPerBox)
        : Number(buyPricePerUnit);
      await inventoryIn(run.game_id, commodity, totalQty, runId, costPerScu, `Bought for trading: ${commodity}`);
    }

    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e: unknown) { routeError(res, e); }
});

router.put('/:id', async (req, res) => {
  const { commodity, quantityBought, boxQuantity, scuPerBox, buyPricePerUnit, buyLocation, sellLocation, status } = req.body;
  // If box fields provided, recompute the total; otherwise use raw quantityBought if given
  const totalQty = (boxQuantity != null && scuPerBox != null)
    ? Number(boxQuantity) * Number(scuPerBox)
    : (quantityBought ?? null);
  // Cost = boxes × price_per_box (price is per box, not per SCU)
  const effectiveBoxes = boxQuantity ?? (totalQty != null && scuPerBox != null ? Number(totalQty) / Number(scuPerBox) : null);
  const totalCost = (buyPricePerUnit != null)
    ? (effectiveBoxes != null ? Number(effectiveBoxes) * Number(buyPricePerUnit) : (totalQty != null ? Number(totalQty) * Number(buyPricePerUnit) : null))
    : null;
  try {
    await db.run(`
      UPDATE trading_entries SET
        commodity = COALESCE(?, commodity),
        quantity_bought = COALESCE(?, quantity_bought),
        box_quantity = COALESCE(?, box_quantity),
        scu_per_box = COALESCE(?, scu_per_box),
        buy_price_per_unit = COALESCE(?, buy_price_per_unit),
        total_cost = COALESCE(?, total_cost),
        buy_location = COALESCE(?, buy_location),
        sell_location = COALESCE(?, sell_location),
        status = COALESCE(?, status)
      WHERE id = ?
    `, [commodity ?? null, totalQty, boxQuantity ?? null, scuPerBox ?? null,
        buyPricePerUnit ?? null, totalCost, buyLocation ?? null, sellLocation ?? null,
        status ?? null, req.params.id]);
    res.json({ ok: true });
  } catch (e: unknown) { routeError(res, e); }
});

router.delete('/:id', async (req, res) => {
  try {
    // Best-effort: reverse the inventory stock-in when a trading entry is removed
    const te = await db.get(`
      SELECT te.commodity, te.quantity_bought, r.game_id
      FROM trading_entries te
      JOIN runs r ON te.run_id = r.id
      WHERE te.id = ?
    `, [req.params.id]);
    if (te) {
      await inventoryOut(te.game_id, te.commodity, te.quantity_bought, null, `Deleted trading entry: ${te.commodity}`);
    }
    await db.run('DELETE FROM trading_entries WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e: unknown) { routeError(res, e); }
});

export default router;
