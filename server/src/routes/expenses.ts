import { Router } from 'express';
import { routeError } from '../lib/routeError';
import { db } from '../db';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { gameId, runId, category } = req.query;
    let q = `
      SELECT e.*, r.title as run_title, r.type as run_type
      FROM expenses e
      LEFT JOIN runs r ON e.run_id = r.id
      WHERE 1=1
    `;
    const args: unknown[] = [];
    if (gameId) { q += ' AND (e.game_id = ? OR r.game_id = ?)'; args.push(gameId, gameId); }
    if (runId) { q += ' AND e.run_id = ?'; args.push(runId); }
    if (category) { q += ' AND e.category = ?'; args.push(category); }
    q += ' ORDER BY e.date DESC, e.id DESC';
    res.json(await db.all(q, args));
  } catch (e: unknown) { routeError(res, e); }
});

router.post('/', async (req, res) => {
  const { runId, gameId, category, itemName, amount, notes, date } = req.body;
  if (!category || amount == null) return res.status(400).json({ error: 'category and amount required' });
  try {
    const result = await db.run(
      'INSERT INTO expenses (run_id, game_id, category, item_name, amount, notes, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [runId ?? null, gameId ?? null, category, itemName ?? null, amount, notes ?? null, date ?? new Date().toISOString().split('T')[0]]
    );
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e: unknown) { routeError(res, e); }
});

router.put('/:id', async (req, res) => {
  const { category, itemName, amount, notes, date } = req.body;
  try {
    await db.run(`
      UPDATE expenses SET
        category = COALESCE(?, category),
        item_name = COALESCE(?, item_name),
        amount = COALESCE(?, amount),
        notes = COALESCE(?, notes),
        date = COALESCE(?, date)
      WHERE id = ?
    `, [category ?? null, itemName ?? null, amount ?? null, notes ?? null, date ?? null, req.params.id]);
    res.json({ ok: true });
  } catch (e: unknown) { routeError(res, e); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM expenses WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e: unknown) { routeError(res, e); }
});

export default router;
