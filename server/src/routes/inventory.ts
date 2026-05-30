import { Router } from 'express';
import { routeError } from '../lib/routeError';
import { db } from '../db';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { gameId } = req.query;
    let q = 'SELECT i.*, g.name as game_name FROM inventory i JOIN games g ON i.game_id = g.id WHERE 1=1';
    const args: unknown[] = [];
    if (gameId) { q += ' AND i.game_id = ?'; args.push(gameId); }
    q += ' ORDER BY i.item';
    res.json(await db.all(q, args));
  } catch (e: unknown) { routeError(res, e); }
});

router.post('/', async (req, res) => {
  const { gameId, item, quantity = 0, unitCost, location } = req.body;
  if (!gameId || !item) return res.status(400).json({ error: 'gameId and item required' });
  try {
    const existing = await db.get(
      'SELECT id FROM inventory WHERE game_id = ? AND item = ? AND (location = ? OR (location IS NULL AND ? IS NULL))',
      [gameId, item, location ?? null, location ?? null]
    );
    if (existing) {
      await db.run("UPDATE inventory SET quantity = quantity + ?, unit_cost = COALESCE(?, unit_cost), updated_at = datetime('now') WHERE id = ?",
        [quantity, unitCost ?? null, existing.id]);
      return res.json({ id: existing.id, updated: true });
    }
    const result = await db.run(
      'INSERT INTO inventory (game_id, item, quantity, unit_cost, location) VALUES (?, ?, ?, ?, ?)',
      [gameId, item, quantity, unitCost ?? null, location ?? null]
    );
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e: unknown) { routeError(res, e); }
});

router.post('/:id/adjust', async (req, res) => {
  const { type, quantity, unitCost, runId, reason } = req.body;
  if (!type || quantity == null) return res.status(400).json({ error: 'type and quantity required' });
  try {
    const inv = await db.get('SELECT * FROM inventory WHERE id = ?', [req.params.id]);
    if (!inv) return res.status(404).json({ error: 'not found' });
    const delta = type === 'in' ? quantity : -quantity;
    if (delta < 0 && inv.quantity + delta < 0) return res.status(400).json({ error: 'insufficient stock' });

    await db.run("UPDATE inventory SET quantity = quantity + ?, updated_at = datetime('now') WHERE id = ?", [delta, req.params.id]);
    await db.run(
      'INSERT INTO inventory_transactions (inventory_id, run_id, type, quantity, unit_cost, reason) VALUES (?, ?, ?, ?, ?, ?)',
      [req.params.id, runId ?? null, type, quantity, unitCost ?? null, reason ?? null]
    );
    res.json({ ok: true });
  } catch (e: unknown) { routeError(res, e); }
});

/** Player-to-player sale: reduces inventory and records income in the ledger */
router.post('/:id/sell', async (req, res) => {
  const { quantity, pricePerUnit, buyerName, notes, date } = req.body;
  if (quantity == null || pricePerUnit == null) {
    return res.status(400).json({ error: 'quantity and pricePerUnit required' });
  }
  try {
    const inv = await db.get('SELECT * FROM inventory WHERE id = ?', [req.params.id]);
    if (!inv) return res.status(404).json({ error: 'not found' });
    if (inv.quantity < quantity) return res.status(400).json({ error: 'insufficient stock' });

    const totalRevenue = quantity * pricePerUnit;
    const soldAt = date ?? new Date().toISOString();

    // Reduce inventory
    await db.run(
      "UPDATE inventory SET quantity = quantity - ?, updated_at = datetime('now') WHERE id = ?",
      [quantity, req.params.id]
    );

    // Record inventory transaction
    await db.run(
      'INSERT INTO inventory_transactions (inventory_id, run_id, type, quantity, unit_cost, reason) VALUES (?, ?, ?, ?, ?, ?)',
      [req.params.id, null, 'out', quantity, pricePerUnit, `Sold to player${buyerName ? ': ' + buyerName : ''}`]
    );

    // Record sale (no run_id)
    const saleResult = await db.run(
      'INSERT INTO sales (run_id, commodity, quantity_sold, price_per_unit, total_revenue, location, sold_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [null, inv.item, quantity, pricePerUnit, totalRevenue, buyerName ?? null, soldAt]
    );

    // Record ledger income entry
    await db.run(
      'INSERT INTO ledger_entries (game_id, run_id, type, category, amount, description, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        inv.game_id, null, 'income', 'player_trade',
        totalRevenue,
        `Sold ${quantity}× ${inv.item}${buyerName ? ' to ' + buyerName : ''}${notes ? ' — ' + notes : ''}`,
        soldAt.split('T')[0],
      ]
    );

    res.status(201).json({ id: saleResult.lastInsertRowid, totalRevenue });
  } catch (e: unknown) { routeError(res, e); }
});

router.get('/:id/transactions', async (req, res) => {
  try {
    const rows = await db.all(
      'SELECT it.*, r.title as run_title FROM inventory_transactions it LEFT JOIN runs r ON it.run_id = r.id WHERE it.inventory_id = ? ORDER BY it.created_at DESC',
      [req.params.id]
    );
    res.json(rows);
  } catch (e: unknown) { routeError(res, e); }
});

router.put('/:id', async (req, res) => {
  const { item, unitCost, location } = req.body;
  try {
    await db.run(`
      UPDATE inventory SET
        item = COALESCE(?, item),
        unit_cost = COALESCE(?, unit_cost),
        location = COALESCE(?, location),
        updated_at = datetime('now')
      WHERE id = ?
    `, [item ?? null, unitCost ?? null, location ?? null, req.params.id]);
    res.json({ ok: true });
  } catch (e: unknown) { routeError(res, e); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM inventory WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e: unknown) { routeError(res, e); }
});

export default router;
