import { Router } from 'express';
import { routeError } from '../lib/routeError';
import { db } from '../db';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const rows = await db.all('SELECT * FROM games ORDER BY name');
    res.json(rows);
  } catch (e: unknown) { routeError(res, e); }
});

router.post('/', async (req, res) => {
  const { name, currency = 'Credits' } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const result = await db.run('INSERT INTO games (name, currency) VALUES (?, ?)', [name, currency]);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e: unknown) { routeError(res, e); }
});

router.put('/:id', async (req, res) => {
  const { name, currency } = req.body;
  try {
    await db.run('UPDATE games SET name = COALESCE(?, name), currency = COALESCE(?, currency) WHERE id = ?', [name ?? null, currency ?? null, req.params.id]);
    res.json({ ok: true });
  } catch (e: unknown) { routeError(res, e); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM games WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e: unknown) { routeError(res, e); }
});

export default router;
