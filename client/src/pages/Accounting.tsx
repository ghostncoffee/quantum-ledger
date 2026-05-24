import { MathInput } from '@/components/ui/MathInput';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { accountingApi, gamesApi } from '@/lib/api';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { StatCard } from '@/components/ui/StatCard';
import { Table, Th, Td, Tr } from '@/components/ui/Table';
import { fmtCurrency, profitColor } from '@/lib/utils';
import { Plus, Trash2, BookOpen } from 'lucide-react';

const LEDGER_TYPES = ['income', 'expense', 'investment', 'crew_payout'] as const;
const INCOME_CATS = ['mining_sale', 'trading_sale', 'contract', 'crafting_sale', 'other'];
const EXPENSE_CATS = ['fuel', 'repairs', 'equipment', 'ammo', 'fees', 'other'];

function NewEntryModal({ open, onClose, games }: { open: boolean; onClose: () => void; games: any[] }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ gameId: '', type: 'income', category: 'other', amount: '', description: '', date: new Date().toISOString().split('T')[0] });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const add = useMutation({
    mutationFn: (d: unknown) => accountingApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ledger'] }); qc.invalidateQueries({ queryKey: ['accounting-summary'] }); onClose(); },
  });

  const cats = form.type === 'income' ? INCOME_CATS : EXPENSE_CATS;

  return (
    <Modal open={open} onClose={onClose} title="Add Ledger Entry">
      <form onSubmit={e => { e.preventDefault(); add.mutate({ gameId: Number(form.gameId), type: form.type, category: form.category, amount: Number(form.amount), description: form.description, date: form.date }); }} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Game *</label>
            <select value={form.gameId} onChange={e => set('gameId', e.target.value)} required>
              <option value="">Select game</option>
              {games.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Type *</label>
            <select value={form.type} onChange={e => { set('type', e.target.value); set('category', 'other'); }}>
              {LEDGER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Category *</label>
            <select value={form.category} onChange={e => set('category', e.target.value)}>
              {cats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Amount *</label>
            <MathInput placeholder="Amount" value={form.amount} onChange={e => set('amount', e.target.value)} required />
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Description *</label>
          <input placeholder="e.g. Rieger C3 mining laser" value={form.description} onChange={e => set('description', e.target.value)} required />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Date</label>
          <input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={add.isPending}><BookOpen size={14} /> Record</Button>
        </div>
      </form>
    </Modal>
  );
}

export function Accounting() {
  const qc = useQueryClient();
  const [newOpen, setNewOpen] = useState(false);
  const [gameFilter, setGameFilter] = useState('');

  const { data: games = [] } = useQuery({ queryKey: ['games'], queryFn: gamesApi.list });
  const { data: summary = [] } = useQuery({ queryKey: ['accounting-summary', gameFilter], queryFn: () => accountingApi.summary(gameFilter ? { gameId: gameFilter } : undefined) });
  const { data: ledger = [] } = useQuery({ queryKey: ['ledger', gameFilter], queryFn: () => accountingApi.list(gameFilter ? { gameId: gameFilter } : undefined) });
  const { data: runReport = [] } = useQuery({ queryKey: ['runs-report', gameFilter], queryFn: () => accountingApi.runsReport(gameFilter ? { gameId: gameFilter } : undefined) });

  const remove = useMutation({
    mutationFn: (id: number) => accountingApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ledger'] }); qc.invalidateQueries({ queryKey: ['accounting-summary'] }); },
  });

  const curr = (summary as any[]).find((g: any) => String(g.game_id) === gameFilter)?.currency || 'UEC';
  const totals = (summary as any[]).find((g: any) => String(g.game_id) === gameFilter) ||
    { total_income: (summary as any[]).reduce((s: number, g: any) => s + g.total_income, 0), total_expenses: (summary as any[]).reduce((s: number, g: any) => s + g.total_expenses, 0), total_investment: (summary as any[]).reduce((s: number, g: any) => s + g.total_investment, 0), total_crew_payouts: (summary as any[]).reduce((s: number, g: any) => s + g.total_crew_payouts, 0), net: (summary as any[]).reduce((s: number, g: any) => s + g.net, 0) };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Accounting</h1>
          <p className="text-sm text-slate-500 mt-0.5">Full ledger & P&L</p>
        </div>
        <div className="flex gap-2">
          <select className="w-40" value={gameFilter} onChange={e => setGameFilter(e.target.value)}>
            <option value="">All games</option>
            {(games as any[]).map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <Button onClick={() => setNewOpen(true)}><Plus size={15} /> Add Entry</Button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Total Revenue" value={fmtCurrency(totals.total_income, curr)} trend="up" />
        <StatCard label="Expenses" value={fmtCurrency(totals.total_expenses, curr)} trend="down" />
        <StatCard label="Investment" value={fmtCurrency(totals.total_investment, curr)} trend="down" />
        <StatCard label="Crew Payouts" value={fmtCurrency(totals.total_crew_payouts, curr)} />
        <StatCard label="Net Profit" value={fmtCurrency(totals.net, curr)} trend={totals.net >= 0 ? 'up' : 'down'} />
      </div>

      {/* Per-run P&L */}
      <Card>
        <CardHeader><CardTitle>P&L by Run</CardTitle></CardHeader>
        <Table>
          <thead>
            <tr>
              <Th>Run</Th><Th>Type</Th><Th>Revenue</Th><Th>Expenses</Th><Th>Crew</Th><Th>Profit</Th><Th>Duration</Th><Th>/hr</Th>
            </tr>
          </thead>
          <tbody>
            {(runReport as any[]).length === 0 ? (
              <Tr><Td colSpan={8} className="text-center text-slate-500">No run data yet.</Td></Tr>
            ) : (
              (runReport as any[]).slice(0, 20).map((r: any) => (
                <Tr key={r.id}>
                  <Td className="font-medium text-slate-200">{r.title || `Run #${r.id}`}</Td>
                  <Td><Badge label={r.type} /></Td>
                  <Td className="text-emerald-400">{fmtCurrency(r.revenue)}</Td>
                  <Td className="text-red-400">{fmtCurrency(r.expenses)}</Td>
                  <Td className="text-amber-400">{fmtCurrency(r.crew_payouts)}</Td>
                  <Td className={profitColor(r.profit)}>{fmtCurrency(r.profit)}</Td>
                  <Td className="text-slate-400">{r.duration_hours != null ? `${r.duration_hours}h` : '—'}</Td>
                  <Td className={r.profitPerHour != null ? profitColor(r.profitPerHour) : 'text-slate-500'}>
                    {r.profitPerHour != null ? fmtCurrency(r.profitPerHour) : '—'}
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>

      {/* Ledger */}
      <Card>
        <CardHeader><CardTitle>Ledger Entries</CardTitle></CardHeader>
        <Table>
          <thead><tr><Th>Date</Th><Th>Type</Th><Th>Category</Th><Th>Description</Th><Th>Amount</Th><Th /></tr></thead>
          <tbody>
            {(ledger as any[]).length === 0 ? (
              <Tr><Td colSpan={6} className="text-center text-slate-500">No entries yet.</Td></Tr>
            ) : (
              (ledger as any[]).map((e: any) => (
                <Tr key={e.id}>
                  <Td className="text-xs text-slate-500">{e.date}</Td>
                  <Td><Badge label={e.type} /></Td>
                  <Td className="text-slate-400 text-xs">{e.category}</Td>
                  <Td className="text-slate-200">{e.description}</Td>
                  <Td className={e.type === 'income' ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                    {e.type === 'income' ? '+' : '-'}{fmtCurrency(e.amount, e.currency)}
                  </Td>
                  <Td><Button variant="danger" size="sm" onClick={() => remove.mutate(e.id)}><Trash2 size={12} /></Button></Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>

      <NewEntryModal open={newOpen} onClose={() => setNewOpen(false)} games={games as any[]} />
    </div>
  );
}



