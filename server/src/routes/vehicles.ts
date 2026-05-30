import { Router } from 'express';
import { routeError } from '../lib/routeError';
import { db } from '../db';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { gameId, type } = req.query;
    let q = 'SELECT v.*, g.name as game_name FROM vehicles v LEFT JOIN games g ON v.game_id = g.id WHERE 1=1';
    const args: unknown[] = [];
    if (gameId) { q += ' AND v.game_id = ?'; args.push(gameId); }
    if (type) { q += ' AND v.type = ?'; args.push(type); }
    q += ' ORDER BY v.name';
    res.json(await db.all(q, args));
  } catch (e: unknown) { routeError(res, e); }
});

router.post('/', async (req, res) => {
  const { name, type, gameId, notes } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'name and type required' });
  try {
    const result = await db.run(
      'INSERT INTO vehicles (name, type, game_id, notes) VALUES (?, ?, ?, ?)',
      [name, type, gameId ?? null, notes ?? null]
    );
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (e: unknown) { routeError(res, e); }
});

router.put('/:id', async (req, res) => {
  const { name, type, gameId, notes } = req.body;
  try {
    await db.run(
      'UPDATE vehicles SET name = COALESCE(?, name), type = COALESCE(?, type), game_id = COALESCE(?, game_id), notes = COALESCE(?, notes) WHERE id = ?',
      [name ?? null, type ?? null, gameId ?? null, notes ?? null, req.params.id]
    );
    res.json({ ok: true });
  } catch (e: unknown) { routeError(res, e); }
});

router.delete('/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM vehicles WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e: unknown) { routeError(res, e); }
});

export default router;
