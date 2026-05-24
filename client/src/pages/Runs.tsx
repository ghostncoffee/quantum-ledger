import { MathInput } from '@/components/ui/MathInput';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { runsApi, gamesApi, vehiclesApi, crewApi } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Table, Th, Td, Tr } from '@/components/ui/Table';
import { fmtCurrency, fmtDuration, fmtDatetime, profitColor, RUN_TYPES } from '@/lib/utils';
import { Plus, Play, CheckCircle, Trash2 } from 'lucide-react';

function NewRunModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: games = [] } = useQuery({ queryKey: ['games'], queryFn: gamesApi.list });
  const { data: vehicles = [] } = useQuery({ queryKey: ['vehicles'], queryFn: () => vehiclesApi.list() });
  const { data: crew = [] } = useQuery({ queryKey: ['crew'], queryFn: () => crewApi.list() });

  const [form, setForm] = useState({
    gameId: '', vehicleId: '', type: 'mining', title: '', location: '', notes: '', startNow: true,
  });
  const [selectedCrew, setSelectedCrew] = useState<{ crewMemberId: number; role: string; payoutType: string; payoutValue: string }[]>([]);

  const mut = useMutation({
    mutationFn: (data: unknown) => runsApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['runs'] }); qc.invalidateQueries({ queryKey: ['runs-recent'] }); onClose(); },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    mut.mutate({
      gameId: Number(form.gameId),
      vehicleId: form.vehicleId ? Number(form.vehicleId) : undefined,
      type: form.type,
      title: form.title || undefined,
      location: form.location || undefined,
      notes: form.notes || undefined,
      startedAt: form.startNow ? new Date().toISOString() : undefined,
      crew: selectedCrew.map(c => ({
        crewMemberId: c.crewMemberId,
        role: c.role || undefined,
        payoutType: c.payoutType,
        payoutValue: Number(c.payoutValue) || 0,
      })),
    });
  };

  const addCrew = () => setSelectedCrew(p => [...p, { crewMemberId: 0, role: '', payoutType: 'percentage', payoutValue: '' }]);
  const removeCrew = (i: number) => setSelectedCrew(p => p.filter((_, j) => j !== i));
  const updateCrew = (i: number, field: string, value: string) =>
    setSelectedCrew(p => p.map((c, j) => j === i ? { ...c, [field]: value } : c));

  const set = (field: string, value: string | boolean) => setForm(f => ({ ...f, [field]: value }));

  return (
    <Modal open={open} onClose={onClose} title="New Run" className="max-w-2xl">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Game *</label>
            <select value={form.gameId} onChange={e => set('gameId', e.target.value)} required>
              <option value="">Select game</option>
              {(games as any[]).map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Run Type *</label>
            <select value={form.type} onChange={e => set('type', e.target.value)} required>
              {RUN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Title</label>
            <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Quantainium run #3" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Vehicle</label>
            <select value={form.vehicleId} onChange={e => set('vehicleId', e.target.value)}>
              <option value="">No vehicle</option>
              {(vehicles as any[]).map((v: any) => <option key={v.id} value={v.id}>{v.name} ({v.type})</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Location</label>
            <input value={form.location} onChange={e => set('location', e.target.value)} placeholder="e.g. Yela Belt" />
          </div>
          <div className="flex items-end gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer pb-2">
              <input type="checkbox" checked={form.startNow} onChange={e => set('startNow', e.target.checked)} className="w-auto accent-blue-500" />
              Start timer now
            </label>
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-400 mb-1 block">Notes</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="Optional notes" />
        </div>

        {/* Crew section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Crew</label>
            <Button type="button" variant="ghost" size="sm" onClick={addCrew}><Plus size={13} /> Add member</Button>
          </div>
          {selectedCrew.map((c, i) => (
            <div key={i} className="grid grid-cols-5 gap-2 mb-2 items-center">
              <div className="col-span-2">
                <select value={c.crewMemberId} onChange={e => updateCrew(i, 'crewMemberId', e.target.value)}>
                  <option value={0}>Select crew</option>
                  {(crew as any[]).map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <input placeholder="Role" value={c.role} onChange={e => updateCrew(i, 'role', e.target.value)} />
              <select value={c.payoutType} onChange={e => updateCrew(i, 'payoutType', e.target.value)}>
                <option value="percentage">%</option>
                <option value="fixed">Fixed</option>
              </select>
              <div className="flex gap-1">
                <MathInput placeholder={c.payoutType === 'percentage' ? '25' : '50000'} value={c.payoutValue} onChange={e => updateCrew(i, 'payoutValue', e.target.value)} />
                <Button type="button" variant="danger" size="sm" onClick={() => removeCrew(i)}>×</Button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={mut.isPending}>
            <Play size={14} /> {mut.isPending ? 'Creating…' : 'Start Run'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function Runs() {
  const qc = useQueryClient();
  const [newOpen, setNewOpen] = useState(false);
  const [filter, setFilter] = useState<{ type: string; status: string }>({ type: '', status: '' });

  const { data: runs = [], isLoading } = useQuery({
    queryKey: ['runs', filter],
    queryFn: () => runsApi.list(Object.fromEntries(Object.entries(filter).filter(([, v]) => v))),
  });

  const completeMut = useMutation({
    mutationFn: (id: number) => runsApi.complete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['runs'] }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => runsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['runs'] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">All Runs</h1>
          <p className="text-sm text-slate-500 mt-0.5">{(runs as any[]).length} run(s)</p>
        </div>
        <Button onClick={() => setNewOpen(true)}><Plus size={15} /> New Run</Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <select className="w-40" value={filter.type} onChange={e => setFilter(f => ({ ...f, type: e.target.value }))}>
          <option value="">All types</option>
          {RUN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="w-40" value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <Card className="p-0">
        <Table>
          <thead>
            <tr>
              <Th>Run</Th>
              <Th>Type</Th>
              <Th>Status</Th>
              <Th>Vehicle</Th>
              <Th>Revenue</Th>
              <Th>Expenses</Th>
              <Th>Profit</Th>
              <Th>Duration</Th>
              <Th>Started</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <Tr><Td colSpan={10} className="text-center text-slate-500">Loading…</Td></Tr>
            ) : (runs as any[]).length === 0 ? (
              <Tr><Td colSpan={10} className="text-center text-slate-500">No runs found. Create one to get started.</Td></Tr>
            ) : (
              (runs as any[]).map((r: any) => (
                <Tr key={r.id}>
                  <Td>
                    <Link to={`/runs/${r.id}`} className="font-medium text-blue-400 hover:text-blue-300">
                      {r.title || `Run #${r.id}`}
                    </Link>
                    {r.location && <p className="text-xs text-slate-500">{r.location}</p>}
                  </Td>
                  <Td><Badge label={r.type} /></Td>
                  <Td><Badge label={r.status} /></Td>
                  <Td className="text-slate-400">{r.vehicle_name || '—'}</Td>
                  <Td className="text-emerald-400">{fmtCurrency(r.total_revenue)}</Td>
                  <Td className="text-red-400">{fmtCurrency(r.total_expenses)}</Td>
                  <Td className={profitColor(r.total_revenue - r.total_expenses)}>
                    {fmtCurrency(r.total_revenue - r.total_expenses)}
                  </Td>
                  <Td className="text-slate-400">{fmtDuration(r.duration_hours)}</Td>
                  <Td className="text-slate-500 text-xs">{fmtDatetime(r.started_at)}</Td>
                  <Td>
                    <div className="flex gap-1">
                      {r.status === 'active' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => completeMut.mutate(r.id)}
                          disabled={completeMut.isPending}
                        >
                          <CheckCircle size={12} /> End
                        </Button>
                      )}
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => { if (window.confirm(`Delete "${r.title || `Run #${r.id}`}"? This cannot be undone.`)) deleteMut.mutate(r.id); }}
                        disabled={deleteMut.isPending}
                      >
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>

      <NewRunModal open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}



