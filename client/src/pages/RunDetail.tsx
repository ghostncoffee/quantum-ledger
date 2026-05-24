import { MathInput } from '@/components/ui/MathInput';
import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  runsApi, miningApi, tradingApi, salesApi, craftingApi,
  contractsApi, haulingApi, expensesApi, crewApi,
} from '@/lib/api';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { StatCard } from '@/components/ui/StatCard';
import { Table, Th, Td, Tr } from '@/components/ui/Table';
import { fmtCurrency, fmtDuration, fmtDatetime, profitColor, EXPENSE_CATEGORIES, CONTRACT_TYPES } from '@/lib/utils';
import { Plus, CheckCircle, Trash2, ChevronLeft, ChevronRight, DollarSign, Clock, AlertTriangle, Users, Star, Copy, Pencil, RotateCcw } from 'lucide-react';

// ─── Mining form types — defined outside component so they never change identity ──
type MineLineForm = { material: string; scu: string; quality: string; is_inert: boolean };
type MineRefineForm = { outputMaterial: string; refineryName: string; refineryMethod: string; costToRefine: string; inputQuantity: string };
const DEFAULT_LINE: MineLineForm = { material: '', scu: '', quality: '', is_inert: false };
const DEFAULT_REFINE: MineRefineForm = { outputMaterial: '', refineryName: '', refineryMethod: '', costToRefine: '', inputQuantity: '' };

// ─── Sub-panel: Mining Pipeline ───────────────────────────────────────────────
function MiningPanel({ runId, currency }: { runId: number; currency: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['mining', runId], queryFn: () => miningApi.getPipeline(runId) });
  const { entries = [], bags = [] } = (data as any) || {};

  const inv = () => qc.invalidateQueries({ queryKey: ['mining', runId] });

  const addBag = useMutation({ mutationFn: (d: unknown) => miningApi.addBag(d), onSuccess: inv });
  const commitBag = useMutation({
    mutationFn: ({ id, location }: { id: number; location: string }) =>
      miningApi.commitBag(id, { location }),
    onSuccess: inv,
  });
  const uncommitBag = useMutation({
    mutationFn: (id: number) => miningApi.uncommitBag(id),
    onSuccess: inv,
  });
  const updateBag = useMutation({
    mutationFn: ({ id, label, capacityScu }: { id: number; label: string; capacityScu?: number | null }) =>
      miningApi.updateBag(id, { label, capacityScu }),
    onSuccess: inv,
  });
  const removeBag = useMutation({ mutationFn: (id: number) => miningApi.removeBag(id), onSuccess: inv });
  const addOreLine = useMutation({
    mutationFn: (d: { bagId: number; runId: number; material: string; scu: number; quality?: number; isInert?: boolean }) =>
      miningApi.addOreLine(d.bagId, { runId: d.runId, material: d.material, scu: d.scu, quality: d.quality, isInert: d.isInert }),
    onSuccess: inv,
  });
  const removeOreLine = useMutation({ mutationFn: (id: number) => miningApi.removeOreLine(id), onSuccess: inv });
  // Legacy entries
  const addEntry = useMutation({ mutationFn: (d: unknown) => miningApi.addEntry(d), onSuccess: inv });
  const removeEntry = useMutation({ mutationFn: (id: number) => miningApi.removeEntry(id), onSuccess: inv });

  const [newBag, setNewBag] = useState({ label: '', capacity: '' });
  const [lineForm, setLineForm] = useState<Record<number, MineLineForm>>({});
  const [showLegacy, setShowLegacy] = useState(false);
  const [entryForm, setEntryForm] = useState({ rawMaterial: '', quantityRaw: '', location: '' });
  const [duplicating, setDuplicating] = useState<number | null>(null);
  const [collapsedBags, setCollapsedBags] = useState<Record<number, boolean>>({});
  const [commitLoc, setCommitLoc] = useState<Record<number, string>>({});
  const [editingBag, setEditingBag] = useState<Record<number, { label: string; capacity: string }>>({});
  const [selectedBags, setSelectedBags] = useState<Record<number, boolean>>({});
  const [batchLoc, setBatchLoc] = useState('');
  const [batchCommitting, setBatchCommitting] = useState(false);

  const startEditBag = (bag: any) =>
    setEditingBag(f => ({ ...f, [bag.id]: { label: bag.label, capacity: String(bag.capacity_scu ?? '') } }));
  const cancelEditBag = (id: number) =>
    setEditingBag(f => { const n = { ...f }; delete n[id]; return n; });
  const saveEditBag = (bagId: number) => {
    const e = editingBag[bagId];
    if (!e) return;
    if (e.label.trim()) {
      updateBag.mutate({ id: bagId, label: e.label.trim(), capacityScu: e.capacity ? Number(e.capacity) : null });
    }
    cancelEditBag(bagId);
  };

  const handleBatchCommit = async () => {
    const ids = Object.entries(selectedBags).filter(([, v]) => v).map(([id]) => Number(id));
    if (!ids.length || !batchLoc.trim()) return;
    setBatchCommitting(true);
    try {
      await Promise.all(ids.map(id => miningApi.commitBag(id, { location: batchLoc.trim() })));
      inv();
      setSelectedBags({});
      setBatchLoc('');
    } finally {
      setBatchCommitting(false);
    }
  };

  const qualityColor = (q: number | null | undefined) => {
    if (q == null) return 'text-slate-500';
    if (q >= 700) return 'text-emerald-400';
    if (q >= 400) return 'text-amber-400';
    return 'text-slate-400';
  };

  // Use f[id] (latest state) inside updaters — avoids stale closure on lineForm
  const getLF = (id: number): MineLineForm => lineForm[id] ?? DEFAULT_LINE;
  const setLF = (id: number, patch: Partial<MineLineForm>) =>
    setLineForm(f => ({ ...f, [id]: { ...(f[id] ?? DEFAULT_LINE), ...patch } }));

  const handleDuplicateBag = async (bag: any) => {
    setDuplicating(bag.id);
    try {
      // Strip any existing "(copy)" suffix so multiple duplicates don't stack
      const base = bag.label.replace(/\s*\(copy(?:\s*\d+)?\)\s*$/i, '').trim();
      const { id: newId } = await miningApi.addBag({
        runId,
        label: `${base} (copy)`,
        capacityScu: bag.capacity_scu ?? undefined,
      });
      for (const line of (bag.lines || [])) {
        await miningApi.addOreLine(newId, {
          runId,
          material: line.material,
          scu: line.scu,
          quality: line.quality ?? undefined,
          isInert: !!line.is_inert,
        });
      }
      qc.invalidateQueries({ queryKey: ['mining', runId] });
    } finally {
      setDuplicating(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Add bag ── */}
      <Card>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-400 shrink-0">New Bag</span>
          <input
            placeholder="Label (e.g. Golem #1)"
            className="flex-1 min-w-[140px]"
            value={newBag.label}
            onChange={e => setNewBag(f => ({ ...f, label: e.target.value }))}
          />
          <MathInput
            placeholder="Capacity SCU"
            className="w-28"
            value={newBag.capacity}
            onChange={e => setNewBag(f => ({ ...f, capacity: e.target.value }))}
          />
          <Button
            size="sm"
            onClick={() => {
              if (!newBag.label) return;
              addBag.mutate({ runId, label: newBag.label, capacityScu: newBag.capacity ? Number(newBag.capacity) : undefined });
              setNewBag({ label: '', capacity: '' });
            }}
          >
            <Plus size={13} /> Add Bag
          </Button>
        </div>
      </Card>

      {/* ── Bag cards ── */}
      {(bags as any[]).length === 0 && (entries as any[]).length === 0 && (
        <p className="text-sm text-slate-500 py-2">No bags yet — add one above to start tracking your cargo hold.</p>
      )}

      {/* ── Batch check-in toolbar ── */}
      {(() => {
        const uncommittedBags = (bags as any[]).filter((b: any) => !b.committed);
        const selectedCount = Object.values(selectedBags).filter(Boolean).length;
        const allSelected = uncommittedBags.length > 0 && uncommittedBags.every((b: any) => selectedBags[b.id]);
        if (uncommittedBags.length < 2) return null;
        return (
          <div className="flex items-center gap-2 flex-wrap px-1">
            <button
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors shrink-0"
              onClick={() => {
                if (allSelected) {
                  setSelectedBags({});
                } else {
                  setSelectedBags(Object.fromEntries(uncommittedBags.map((b: any) => [b.id, true])));
                }
              }}
            >
              {allSelected ? 'Deselect all' : `Select all (${uncommittedBags.length})`}
            </button>
            {selectedCount > 0 && (
              <>
                <span className="text-slate-600">·</span>
                <span className="text-xs text-slate-400 shrink-0">{selectedCount} bag{selectedCount !== 1 ? 's' : ''} selected</span>
                <input
                  placeholder="Location for all (e.g. ARC-L1 Covalex)"
                  className="flex-1 min-w-[180px] text-sm"
                  value={batchLoc}
                  onChange={e => setBatchLoc(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleBatchCommit(); }}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleBatchCommit}
                  disabled={batchCommitting || !batchLoc.trim()}
                >
                  <CheckCircle size={12} /> Check In {selectedCount}
                </Button>
                <button
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors shrink-0"
                  onClick={() => setSelectedBags({})}
                >
                  Clear
                </button>
              </>
            )}
          </div>
        );
      })()}

      {(bags as any[]).map((bag: any) => {
        const lines: any[] = bag.lines || [];
        const usedScu = lines.reduce((s: number, l: any) => s + (Number(l.scu) || 0), 0);
        const nonInertScu = lines.filter((l: any) => !l.is_inert).reduce((s: number, l: any) => s + (Number(l.scu) || 0), 0);
        const fillPct = bag.capacity_scu ? Math.min((usedScu / bag.capacity_scu) * 100, 100) : 0;
        const lf = getLF(bag.id);
        const isCollapsed = collapsedBags[bag.id] ?? false;

        return (
          <Card key={bag.id}>
            {/* Header */}
            <div className="flex items-start justify-between mb-2 gap-2">
              <button
                onClick={() => setCollapsedBags(f => ({ ...f, [bag.id]: !isCollapsed }))}
                className="mt-0.5 shrink-0 text-slate-500 hover:text-slate-300 transition-colors"
                title={isCollapsed ? 'Expand' : 'Collapse'}
              >
                <ChevronRight size={14} className={`transition-transform duration-150 ${isCollapsed ? '' : 'rotate-90'}`} />
              </button>
              {!bag.committed && (
                <input
                  type="checkbox"
                  checked={!!selectedBags[bag.id]}
                  onChange={e => setSelectedBags(f => ({ ...f, [bag.id]: e.target.checked }))}
                  className="w-3.5 h-3.5 shrink-0 mt-1 cursor-pointer accent-blue-500"
                  title="Select for batch check-in"
                />
              )}
              {editingBag[bag.id] ? (
                /* ── Edit mode ── */
                <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                  <input
                    autoFocus
                    className="font-semibold text-slate-200 flex-1 min-w-[120px]"
                    value={editingBag[bag.id].label}
                    onChange={e => setEditingBag(f => ({ ...f, [bag.id]: { ...f[bag.id], label: e.target.value } }))}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveEditBag(bag.id);
                      if (e.key === 'Escape') cancelEditBag(bag.id);
                    }}
                    onBlur={() => saveEditBag(bag.id)}
                  />
                  <MathInput
                    placeholder="Capacity SCU"
                    className="w-28 text-xs"
                    value={editingBag[bag.id].capacity}
                    onChange={e => setEditingBag(f => ({ ...f, [bag.id]: { ...f[bag.id], capacity: e.target.value } }))}
                    onBlur={() => saveEditBag(bag.id)}
                    onKeyDown={(e: React.KeyboardEvent) => {
                      if (e.key === 'Enter') saveEditBag(bag.id);
                      if (e.key === 'Escape') cancelEditBag(bag.id);
                    }}
                  />
                </div>
              ) : (
                /* ── Display mode — click pencil or label to edit ── */
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <button
                    onClick={() => startEditBag(bag)}
                    className="flex items-center gap-1.5 group text-left min-w-0"
                    title="Click to rename"
                  >
                    <span className="font-semibold text-slate-200">{bag.label}</span>
                    {bag.capacity_scu ? (
                      <span className="text-xs text-slate-500">
                        {usedScu.toFixed(2)} / {bag.capacity_scu} SCU
                      </span>
                    ) : lines.length > 0 ? (
                      <span className="text-xs text-slate-500">{usedScu.toFixed(2)} SCU</span>
                    ) : null}
                    <Pencil size={11} className="text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                  {!!bag.committed && (
                    <span className="text-xs bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded shrink-0">
                      ✓ {bag.committed_location || 'checked in'}
                    </span>
                  )}
                </div>
              )}
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleDuplicateBag(bag)}
                  disabled={duplicating === bag.id}
                  title="Duplicate bag"
                >
                  <Copy size={12} />
                </Button>
                <Button variant="danger" size="sm" onClick={() => removeBag.mutate(bag.id)}>
                  <Trash2 size={12} />
                </Button>
              </div>
            </div>

            {/* Collapsible body */}
            {!isCollapsed && (
              <>
                {/* Fill bar */}
                {bag.capacity_scu ? (
                  <div className="h-1.5 bg-slate-800 rounded-full mb-3 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        fillPct > 90 ? 'bg-red-500' : fillPct > 60 ? 'bg-amber-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${fillPct}%` }}
                    />
                  </div>
                ) : null}

                {/* Ore lines table */}
                {lines.length > 0 && (
                  <Table>
                    <thead>
                      <tr>
                        <Th>Material</Th>
                        <Th>SCU</Th>
                        <Th>Quality</Th>
                        <Th />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line: any) => (
                        <Tr key={line.id}>
                          <Td className={line.is_inert ? 'text-slate-500' : 'text-slate-200'}>
                            <span className="font-medium">{line.material}</span>
                            {!!line.is_inert && (
                              <span className="ml-1.5 text-xs bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">inert</span>
                            )}
                          </Td>
                          <Td>{line.scu}</Td>
                          <Td className={qualityColor(line.quality)}>
                            {line.quality != null ? line.quality : '—'}
                          </Td>
                          <Td>
                            <Button variant="danger" size="sm" onClick={() => removeOreLine.mutate(line.id)}>
                              <Trash2 size={12} />
                            </Button>
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                )}

                {/* Add ore line */}
                <div className="flex gap-2 mt-2 flex-wrap items-center">
                  <input
                    placeholder="Material"
                    className="flex-1 min-w-[130px]"
                    value={lf.material}
                    onChange={e => setLF(bag.id, { material: e.target.value })}
                  />
                  <MathInput
                    placeholder="SCU"
                    className="w-20"
                    value={lf.scu}
                    onChange={e => setLF(bag.id, { scu: e.target.value })}
                  />
                  <MathInput
                    placeholder="Quality"
                    className="w-20"
                    value={lf.quality}
                    onChange={e => setLF(bag.id, { quality: e.target.value })}
                  />
                  <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none shrink-0">
                    <input
                      type="checkbox"
                      checked={lf.is_inert}
                      onChange={e => setLF(bag.id, { is_inert: e.target.checked })}
                      className="w-3 h-3"
                    />
                    Inert
                  </label>
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!lf.material || !lf.scu) return;
                      addOreLine.mutate({
                        bagId: bag.id,
                        runId,
                        material: lf.material,
                        scu: Number(lf.scu),
                        quality: lf.quality ? Number(lf.quality) : undefined,
                        isInert: lf.is_inert,
                      });
                      setLF(bag.id, DEFAULT_LINE);
                    }}
                  >
                    <Plus size={12} /> Add
                  </Button>
                </div>

                {/* ── Check-in / Refinery gate ── */}
                <div className="mt-3 pt-3 border-t border-slate-700/40">
                  {bag.committed ? (
                    /* Committed — show location badge + pointer to Refining tab */
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-emerald-400 font-medium">
                        ✓ Checked in at <span className="font-semibold">{bag.committed_location || 'station'}</span>
                      </span>
                      <button
                        onClick={() => uncommitBag.mutate(bag.id)}
                        className="text-xs text-slate-500 hover:text-slate-300 transition-colors underline-offset-2 hover:underline"
                      >
                        move / undo
                      </button>
                      <span className="text-xs text-slate-600">→ use the Refining tab to queue a job</span>
                    </div>
                  ) : (
                    /* Not committed — show check-in form */
                    <div>
                      <p className="text-xs text-slate-500 mb-2">
                        Check in this bag at a station to enable refining.
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        <input
                          placeholder="Location (e.g. ARC-L1 Covalex)"
                          className="flex-1 min-w-[180px]"
                          value={commitLoc[bag.id] || ''}
                          onChange={e => setCommitLoc(f => ({ ...f, [bag.id]: e.target.value }))}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              commitBag.mutate({ id: bag.id, location: commitLoc[bag.id] || '' });
                              setCommitLoc(f => ({ ...f, [bag.id]: '' }));
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            commitBag.mutate({ id: bag.id, location: commitLoc[bag.id] || '' });
                            setCommitLoc(f => ({ ...f, [bag.id]: '' }));
                          }}
                        >
                          <CheckCircle size={12} /> Check In
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </Card>
        );
      })}

      {/* ── Legacy entries (backward compat) ── */}
      {(entries as any[]).length > 0 && (
        <div>
          <button
            onClick={() => setShowLegacy(v => !v)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors mb-2"
          >
            <ChevronRight size={11} className={`transition-transform duration-150 ${showLegacy ? 'rotate-90' : ''}`} />
            {showLegacy ? 'Hide' : 'Show'} {(entries as any[]).length} legacy ore entr{(entries as any[]).length === 1 ? 'y' : 'ies'}
          </button>
          {showLegacy && (
            <Card>
              <CardHeader><CardTitle>Legacy Ore Entries</CardTitle></CardHeader>
              <Table>
                <thead><tr><Th>Material</Th><Th>Qty (SCU)</Th><Th>Location</Th><Th /></tr></thead>
                <tbody>
                  {(entries as any[]).map((e: any) => (
                    <Tr key={e.id}>
                      <Td className="font-medium text-slate-200">{e.raw_material}</Td>
                      <Td>{e.quantity_raw}</Td>
                      <Td className="text-slate-500">{e.location || '—'}</Td>
                      <Td>
                        <Button variant="danger" size="sm" onClick={() => removeEntry.mutate(e.id)}>
                          <Trash2 size={12} />
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
              <div className="mt-3 pt-3 border-t border-slate-700/40 grid grid-cols-3 gap-2">
                <input placeholder="Material" value={entryForm.rawMaterial} onChange={e => setEntryForm(f => ({ ...f, rawMaterial: e.target.value }))} />
                <MathInput placeholder="Quantity (SCU)" value={entryForm.quantityRaw} onChange={e => setEntryForm(f => ({ ...f, quantityRaw: e.target.value }))} />
                <input placeholder="Location" value={entryForm.location} onChange={e => setEntryForm(f => ({ ...f, location: e.target.value }))} />
                <Button size="sm" className="col-span-3 sm:col-span-1" onClick={() => {
                  if (!entryForm.rawMaterial || !entryForm.quantityRaw) return;
                  addEntry.mutate({ runId, rawMaterial: entryForm.rawMaterial, quantityRaw: Number(entryForm.quantityRaw), location: entryForm.location || undefined });
                  setEntryForm({ rawMaterial: '', quantityRaw: '', location: '' });
                }}><Plus size={13} /> Add Legacy Entry</Button>
              </div>
            </Card>
          )}
        </div>
      )}

    </div>
  );
}

// ─── Sub-panel: Refining ──────────────────────────────────────────────────────
function RefiningPanel({ runId, currency }: { runId: number; currency: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['mining', runId], queryFn: () => miningApi.getPipeline(runId) });
  const { bags = [], refiningJobs = [], sales = [] } = (data as any) || {};

  const inv = () => qc.invalidateQueries({ queryKey: ['mining', runId] });
  const invAll = () => {
    qc.invalidateQueries({ queryKey: ['mining', runId] });
    qc.invalidateQueries({ queryKey: ['run', runId] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
  };

  const addRefining = useMutation({ mutationFn: (d: unknown) => miningApi.addRefining(d), onSuccess: inv });
  const removeRefining = useMutation({ mutationFn: (id: number) => miningApi.removeRefining(id), onSuccess: inv });
  const finishRefining = useMutation({
    mutationFn: ({ id, qty, eff }: { id: number; qty: number; eff: number }) =>
      miningApi.updateRefining(id, { outputQuantity: qty, efficiency: eff, status: 'done', completedAt: new Date().toISOString() }),
    onSuccess: () => { inv(); qc.invalidateQueries({ queryKey: ['inventory'] }); },
  });
  const addSale = useMutation({ mutationFn: (d: unknown) => salesApi.create(d), onSuccess: invAll });
  const removeSale = useMutation({ mutationFn: (id: number) => salesApi.remove(id), onSuccess: invAll });

  const [refineOpen, setRefineOpen] = useState<Record<number, boolean>>({});
  const [refineForm, setRefineForm] = useState<Record<number, MineRefineForm>>({});
  const [finishForm, setFinishForm] = useState<Record<number, { qty: string; eff: string }>>({});
  const [saleForm, setSaleForm] = useState({ refiningJobId: '', commodity: '', quantitySold: '', pricePerUnit: '', location: '' });
  type QuickSaleForm = { commodity: string; qty: string; price: string; location: string };
  const [quickSale, setQuickSale] = useState<Record<number, QuickSaleForm | null>>({});

  const openQuickSale = (rj: any) =>
    setQuickSale(f => ({
      ...f,
      [rj.id]: { commodity: rj.output_material || '', qty: String(rj.output_quantity ?? ''), price: '', location: '' },
    }));

  const getRF = (id: number): MineRefineForm => refineForm[id] ?? DEFAULT_REFINE;
  const setRF = (id: number, patch: Partial<MineRefineForm>) =>
    setRefineForm(f => ({ ...f, [id]: { ...(f[id] ?? DEFAULT_REFINE), ...patch } }));

  const committedBags = (bags as any[]).filter((b: any) => b.committed);

  return (
    <div className="space-y-4">

      {/* ── Empty state ── */}
      {committedBags.length === 0 && (refiningJobs as any[]).length === 0 && (sales as any[]).length === 0 && (
        <div className="text-center py-10">
          <p className="text-slate-400 font-medium">No refining activity yet</p>
          <p className="text-sm text-slate-600 mt-1">Check in your mining bags from the Mining tab first, then queue jobs here.</p>
        </div>
      )}

      {/* ── Queue refining job ── */}
      {committedBags.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Queue Refining Job</CardTitle></CardHeader>
          <div className="divide-y divide-slate-700/40">
            {committedBags.map((bag: any) => {
              const lines: any[] = bag.lines || [];
              const nonInertScu = lines.filter((l: any) => !l.is_inert).reduce((s: number, l: any) => s + (Number(l.scu) || 0), 0);
              const isOpen = refineOpen[bag.id] ?? false;
              const rf = getRF(bag.id);
              return (
                <div key={bag.id} className="py-3 first:pt-0 last:pb-0">
                  <button
                    onClick={() => setRefineOpen(f => ({ ...f, [bag.id]: !isOpen }))}
                    className="flex items-center gap-2 w-full text-left group"
                  >
                    <ChevronRight size={13} className={`shrink-0 text-slate-500 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`} />
                    <span className="font-medium text-slate-200 text-sm">{bag.label}</span>
                    {bag.committed_location && <span className="text-xs text-slate-500">@ {bag.committed_location}</span>}
                    {nonInertScu > 0 && <span className="text-xs text-slate-500">· {nonInertScu.toFixed(2)} SCU ore</span>}
                    {lines.filter((l: any) => !l.is_inert).map((l: any) => (
                      <span key={l.id} className="text-xs text-slate-600">{l.material}</span>
                    ))}
                  </button>
                  {isOpen && (
                    <div className="mt-2 ml-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <input
                        placeholder="Output material *"
                        value={rf.outputMaterial}
                        onChange={e => setRF(bag.id, { outputMaterial: e.target.value })}
                      />
                      <input
                        placeholder={bag.committed_location || 'Refinery name'}
                        value={rf.refineryName}
                        onChange={e => setRF(bag.id, { refineryName: e.target.value })}
                      />
                      <input
                        placeholder="Method (e.g. Dinyx)"
                        value={rf.refineryMethod}
                        onChange={e => setRF(bag.id, { refineryMethod: e.target.value })}
                      />
                      <MathInput
                        placeholder={nonInertScu > 0 ? `Input SCU (${nonInertScu.toFixed(2)})` : 'Input SCU'}
                        value={rf.inputQuantity}
                        onChange={e => setRF(bag.id, { inputQuantity: e.target.value })}
                      />
                      <MathInput
                        placeholder="Refining cost"
                        value={rf.costToRefine}
                        onChange={e => setRF(bag.id, { costToRefine: e.target.value })}
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          const inputQty = rf.inputQuantity ? Number(rf.inputQuantity) : nonInertScu;
                          if (!rf.outputMaterial || !inputQty) return;
                          addRefining.mutate({
                            bagId: bag.id,
                            inputQuantity: inputQty,
                            outputMaterial: rf.outputMaterial,
                            refineryName: rf.refineryName || bag.committed_location || undefined,
                            refineryMethod: rf.refineryMethod || undefined,
                            costToRefine: Number(rf.costToRefine) || 0,
                          });
                          setRefineOpen(f => ({ ...f, [bag.id]: false }));
                          setRF(bag.id, DEFAULT_REFINE);
                        }}
                      >
                        <Plus size={13} /> Queue Job
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── Refining jobs ── */}
      {(refiningJobs as any[]).length > 0 && (
        <Card>
          <CardHeader><CardTitle>Refining Jobs</CardTitle></CardHeader>
          <div className="space-y-0">
            {(refiningJobs as any[]).map((rj: any) => {
              const isSold = (rj.sale_revenue ?? 0) > 0;
              const needsSale = rj.status === 'done' && !isSold;
              const qs = quickSale[rj.id];
              return (
                <div key={rj.id} className={`border-b border-slate-700/40 last:border-0 ${needsSale ? 'bg-amber-500/5' : ''}`}>
                  <div className="grid grid-cols-[1fr_auto] gap-2 px-3 py-2.5 items-start">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-200 text-sm">{rj.output_material}</span>
                        <Badge label={rj.status} />
                        {rj.refinery_name && <span className="text-xs text-slate-500">{rj.refinery_name}{rj.refinery_method ? ` · ${rj.refinery_method}` : ''}</span>}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                        <span>Source: {rj.source_label || '—'}</span>
                        <span>In: {rj.input_quantity} SCU</span>
                        {rj.output_quantity != null && <span>Out: {rj.output_quantity} SCU</span>}
                        {rj.efficiency != null && <span>Yield: {rj.efficiency}%</span>}
                        <span className="text-red-400">Cost: {fmtCurrency(rj.cost_to_refine, currency)}</span>
                        {isSold && <span className="text-emerald-400 font-medium">Sold: {fmtCurrency(rj.sale_revenue, currency)}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {rj.status !== 'done' ? (
                        <div className="flex gap-1">
                          <MathInput
                            placeholder="Out qty"
                            className="w-20"
                            value={finishForm[rj.id]?.qty || ''}
                            onChange={e => setFinishForm(f => ({ ...f, [rj.id]: { ...f[rj.id], qty: e.target.value } }))}
                          />
                          <MathInput
                            placeholder="%"
                            className="w-14"
                            value={finishForm[rj.id]?.eff || ''}
                            onChange={e => setFinishForm(f => ({ ...f, [rj.id]: { ...f[rj.id], eff: e.target.value } }))}
                          />
                          <Button size="sm" variant="secondary" onClick={() => {
                            const f = finishForm[rj.id];
                            if (!f?.qty) return;
                            finishRefining.mutate({ id: rj.id, qty: Number(f.qty), eff: Number(f.eff) || 0 });
                          }}><CheckCircle size={12} /></Button>
                        </div>
                      ) : needsSale ? (
                        <Button size="sm" variant="secondary" onClick={() => openQuickSale(rj)}>
                          <DollarSign size={12} /> Record Sale
                        </Button>
                      ) : null}
                      <Button variant="danger" size="sm" onClick={() => removeRefining.mutate(rj.id)}>
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </div>

                  {qs && (
                    <div className="px-3 pb-3 pt-1 bg-slate-800/40 border-t border-slate-700/40">
                      <p className="text-xs text-slate-400 mb-2">Record the sale — links revenue to this run.</p>
                      <div className="flex gap-2 flex-wrap items-end">
                        <div className="flex-1 min-w-[130px]">
                          <p className="text-xs text-slate-500 mb-1">Commodity</p>
                          <input value={qs.commodity} onChange={e => setQuickSale(f => ({ ...f, [rj.id]: { ...f[rj.id]!, commodity: e.target.value } }))} placeholder="e.g. Quantanium" />
                        </div>
                        <div className="w-24">
                          <p className="text-xs text-slate-500 mb-1">Qty sold</p>
                          <MathInput value={qs.qty} onChange={e => setQuickSale(f => ({ ...f, [rj.id]: { ...f[rj.id]!, qty: e.target.value } }))} placeholder="SCU" />
                        </div>
                        <div className="w-32">
                          <p className="text-xs text-slate-500 mb-1">Price / unit</p>
                          <MathInput value={qs.price} onChange={e => setQuickSale(f => ({ ...f, [rj.id]: { ...f[rj.id]!, price: e.target.value } }))} placeholder={currency} />
                        </div>
                        <div className="w-36">
                          <p className="text-xs text-slate-500 mb-1">Location</p>
                          <input value={qs.location} onChange={e => setQuickSale(f => ({ ...f, [rj.id]: { ...f[rj.id]!, location: e.target.value } }))} placeholder="Optional" />
                        </div>
                        {qs.qty && qs.price && (
                          <div className="text-sm text-emerald-400 font-semibold pb-0.5">
                            = {fmtCurrency(Number(qs.qty) * Number(qs.price), currency)}
                          </div>
                        )}
                        <div className="flex gap-1.5 pb-0.5">
                          <Button size="sm" onClick={() => {
                            if (!qs.commodity || !qs.qty || !qs.price) return;
                            addSale.mutate({ runId, refiningJobId: rj.id, commodity: qs.commodity, quantitySold: Number(qs.qty), pricePerUnit: Number(qs.price), location: qs.location || undefined });
                            setQuickSale(f => ({ ...f, [rj.id]: null }));
                          }}><CheckCircle size={12} /> Save Sale</Button>
                          <Button size="sm" variant="secondary" onClick={() => setQuickSale(f => ({ ...f, [rj.id]: null }))}>Cancel</Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── Manual sale (not linked to a refining job) ── */}
      <Card>
        <CardHeader><CardTitle>Record Sale</CardTitle></CardHeader>
        <div className="grid grid-cols-3 gap-2">
          <select value={saleForm.refiningJobId} onChange={e => setSaleForm(f => ({ ...f, refiningJobId: e.target.value }))}>
            <option value="">Link refining job (optional)</option>
            {(refiningJobs as any[]).filter((rj: any) => rj.status === 'done').map((rj: any) => (
              <option key={rj.id} value={rj.id}>{rj.output_material} — {rj.output_quantity} SCU</option>
            ))}
          </select>
          <input placeholder="Commodity" value={saleForm.commodity} onChange={e => setSaleForm(f => ({ ...f, commodity: e.target.value }))} />
          <MathInput placeholder="Qty sold" value={saleForm.quantitySold} onChange={e => setSaleForm(f => ({ ...f, quantitySold: e.target.value }))} />
          <MathInput placeholder="Price per unit" value={saleForm.pricePerUnit} onChange={e => setSaleForm(f => ({ ...f, pricePerUnit: e.target.value }))} />
          <input placeholder="Location" value={saleForm.location} onChange={e => setSaleForm(f => ({ ...f, location: e.target.value }))} />
          {saleForm.quantitySold && saleForm.pricePerUnit && (
            <div className="flex items-center text-emerald-400 text-sm font-semibold">
              = {fmtCurrency(Number(saleForm.quantitySold) * Number(saleForm.pricePerUnit), currency)}
            </div>
          )}
        </div>
        <Button className="mt-2" size="sm" onClick={() => {
          if (!saleForm.commodity || !saleForm.quantitySold || !saleForm.pricePerUnit) return;
          addSale.mutate({ runId, refiningJobId: saleForm.refiningJobId ? Number(saleForm.refiningJobId) : undefined, commodity: saleForm.commodity, quantitySold: Number(saleForm.quantitySold), pricePerUnit: Number(saleForm.pricePerUnit), location: saleForm.location || undefined });
          setSaleForm({ refiningJobId: '', commodity: '', quantitySold: '', pricePerUnit: '', location: '' });
        }}><DollarSign size={13} /> Record Sale</Button>
      </Card>

      {/* ── Sales log ── */}
      {(sales as any[]).length > 0 && (
        <Card>
          <CardHeader><CardTitle>Sales</CardTitle></CardHeader>
          <Table>
            <thead><tr><Th>Commodity</Th><Th>Qty</Th><Th>Price/unit</Th><Th>Revenue</Th><Th>Location</Th><Th /></tr></thead>
            <tbody>
              {(sales as any[]).map((s: any) => (
                <Tr key={s.id}>
                  <Td className="font-medium">{s.commodity}</Td>
                  <Td>{s.quantity_sold}</Td>
                  <Td>{fmtCurrency(s.price_per_unit, currency)}</Td>
                  <Td className="text-emerald-400 font-semibold">{fmtCurrency(s.total_revenue, currency)}</Td>
                  <Td className="text-slate-500">{s.location || '—'}</Td>
                  <Td><Button variant="danger" size="sm" onClick={() => removeSale.mutate(s.id)}><Trash2 size={12} /></Button></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}

// ─── Sub-panel: Trading ───────────────────────────────────────────────────────
function TradingPanel({ runId, currency }: { runId: number; currency: string }) {
  const qc = useQueryClient();
  const { data: entries = [] } = useQuery({ queryKey: ['trading', runId], queryFn: () => tradingApi.getForRun(runId) });

  const [buyForm, setBuyForm] = useState({ commodity: '', quantityBought: '', buyPricePerUnit: '', buyLocation: '', sellLocation: '' });
  const [sellForm, setSellForm] = useState<{ [entryId: number]: { qty: string; price: string; location: string } }>({});

  const addEntry = useMutation({
    mutationFn: (d: unknown) => tradingApi.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trading', runId] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
  const removeEntry = useMutation({
    mutationFn: (id: number) => tradingApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trading', runId] });
      qc.invalidateQueries({ queryKey: ['run', runId] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
  const recordSale = useMutation({
    mutationFn: (d: unknown) => salesApi.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trading', runId] });
      qc.invalidateQueries({ queryKey: ['run', runId] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Buy Commodity</CardTitle></CardHeader>
        <div className="grid grid-cols-3 gap-2">
          <input placeholder="Commodity" value={buyForm.commodity} onChange={e => setBuyForm(f => ({ ...f, commodity: e.target.value }))} />
          <MathInput placeholder="Qty bought" value={buyForm.quantityBought} onChange={e => setBuyForm(f => ({ ...f, quantityBought: e.target.value }))} />
          <MathInput placeholder="Buy price/unit" value={buyForm.buyPricePerUnit} onChange={e => setBuyForm(f => ({ ...f, buyPricePerUnit: e.target.value }))} />
          <input placeholder="Buy location" value={buyForm.buyLocation} onChange={e => setBuyForm(f => ({ ...f, buyLocation: e.target.value }))} />
          <input placeholder="Planned sell location" value={buyForm.sellLocation} onChange={e => setBuyForm(f => ({ ...f, sellLocation: e.target.value }))} />
          {buyForm.quantityBought && buyForm.buyPricePerUnit && (
            <div className="flex items-center text-red-400 text-sm font-semibold">
              Cost: {fmtCurrency(Number(buyForm.quantityBought) * Number(buyForm.buyPricePerUnit), currency)}
            </div>
          )}
        </div>
        <Button className="mt-2" size="sm" onClick={() => {
          if (!buyForm.commodity || !buyForm.quantityBought || !buyForm.buyPricePerUnit) return;
          addEntry.mutate({ runId, commodity: buyForm.commodity, quantityBought: Number(buyForm.quantityBought), buyPricePerUnit: Number(buyForm.buyPricePerUnit), buyLocation: buyForm.buyLocation || undefined, sellLocation: buyForm.sellLocation || undefined });
          setBuyForm({ commodity: '', quantityBought: '', buyPricePerUnit: '', buyLocation: '', sellLocation: '' });
        }}><Plus size={13} /> Record Purchase</Button>
      </Card>

      {(entries as any[]).length > 0 && (
        <div className="space-y-3">
          {(entries as any[]).map((e: any) => {
            const remaining = e.quantity_bought - (e.sold_quantity ?? 0);
            const margin = e.revenue > 0 ? e.revenue - e.total_cost : null;
            const sf = sellForm[e.id] || { qty: '', price: '', location: '' };
            return (
              <Card key={e.id}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="font-semibold text-slate-200">{e.commodity}</span>
                    <span className="ml-2 text-xs text-slate-500">{e.buy_location || '?'} → {e.sell_location || '?'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge label={e.status} />
                    <Button variant="danger" size="sm" onClick={() => removeEntry.mutate(e.id)}><Trash2 size={12} /></Button>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3 text-sm mb-3">
                  <div><p className="text-xs text-slate-500">Bought</p><p className="text-slate-200">{e.quantity_bought} @ {fmtCurrency(e.buy_price_per_unit, currency)}</p></div>
                  <div><p className="text-xs text-slate-500">Cost</p><p className="text-red-400">{fmtCurrency(e.total_cost, currency)}</p></div>
                  <div><p className="text-xs text-slate-500">Revenue</p><p className="text-emerald-400">{fmtCurrency(e.revenue, currency)}</p></div>
                  <div><p className="text-xs text-slate-500">Margin</p><p className={margin != null ? profitColor(margin) : 'text-slate-500'}>{margin != null ? fmtCurrency(margin, currency) : '—'}</p></div>
                </div>
                {remaining > 0 && (
                  <div className="border-t border-[#1e2d4f] pt-2">
                    <p className="text-xs text-slate-500 mb-1.5">Record sale ({remaining} remaining)</p>
                    <div className="flex gap-2">
                      <MathInput placeholder={`Qty (max ${remaining})`} className="w-28" value={sf.qty} onChange={ev => setSellForm(f => ({ ...f, [e.id]: { ...f[e.id], qty: ev.target.value } }))} />
                      <MathInput placeholder="Price/unit" className="w-28" value={sf.price} onChange={ev => setSellForm(f => ({ ...f, [e.id]: { ...f[e.id], price: ev.target.value } }))} />
                      <input placeholder="Location" className="w-32" value={sf.location} onChange={ev => setSellForm(f => ({ ...f, [e.id]: { ...f[e.id], location: ev.target.value } }))} />
                      <Button size="sm" onClick={() => {
                        if (!sf.qty || !sf.price) return;
                        recordSale.mutate({ runId, tradingEntryId: e.id, commodity: e.commodity, quantitySold: Number(sf.qty), pricePerUnit: Number(sf.price), location: sf.location || undefined });
                        setSellForm(f => ({ ...f, [e.id]: { qty: '', price: '', location: '' } }));
                      }}><DollarSign size={12} /> Sell</Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Sub-panel: Hauling ───────────────────────────────────────────────────────
function HaulingPanel({ runId, currency }: { runId: number; currency: string }) {
  const qc = useQueryClient();
  const { data: jobs = [] } = useQuery({
    queryKey: ['hauling', runId],
    queryFn: () => haulingApi.getForRun(runId),
  });

  const [form, setForm] = useState({
    cargoType: '', scuAmount: '', pickupLocation: '',
    deliveryLocation: '', agreedPayout: '', bonusPayout: '', notes: '',
  });

  const add = useMutation({
    mutationFn: (d: unknown) => haulingApi.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hauling', runId] });
      qc.invalidateQueries({ queryKey: ['run', runId] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => haulingApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hauling', runId] });
      qc.invalidateQueries({ queryKey: ['run', runId] });
    },
  });
  const advance = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      haulingApi.update(id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hauling', runId] });
      qc.invalidateQueries({ queryKey: ['run', runId] });
    },
  });

  const deliveredTotal = (jobs as any[])
    .filter((j: any) => j.status === 'delivered')
    .reduce((s: number, j: any) => s + j.agreed_payout + (j.bonus_payout || 0), 0);
  const pendingTotal = (jobs as any[])
    .filter((j: any) => j.status !== 'delivered')
    .reduce((s: number, j: any) => s + j.agreed_payout, 0);

  const NEXT_STATUS: Record<string, string> = { pending: 'in_transit', in_transit: 'delivered' };
  const NEXT_LABEL: Record<string, string> = { pending: 'Mark Picked Up', in_transit: 'Mark Delivered' };

  return (
    <div className="space-y-4">
      {(jobs as any[]).length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Contracts" value={String((jobs as any[]).length)} />
          <StatCard label="Earned" value={fmtCurrency(deliveredTotal, currency)} trend="up" />
          <StatCard label="Pending" value={fmtCurrency(pendingTotal, currency)} />
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Add Hauling Contract</CardTitle></CardHeader>
        <div className="grid grid-cols-3 gap-2">
          <input placeholder="Cargo type (e.g. Medical Supplies)" value={form.cargoType} onChange={e => setForm(f => ({ ...f, cargoType: e.target.value }))} />
          <MathInput placeholder="SCU amount" value={form.scuAmount} onChange={e => setForm(f => ({ ...f, scuAmount: e.target.value }))} />
          <MathInput placeholder="Agreed payout" value={form.agreedPayout} onChange={e => setForm(f => ({ ...f, agreedPayout: e.target.value }))} />
          <input placeholder="Pickup location" value={form.pickupLocation} onChange={e => setForm(f => ({ ...f, pickupLocation: e.target.value }))} />
          <input placeholder="Delivery location" value={form.deliveryLocation} onChange={e => setForm(f => ({ ...f, deliveryLocation: e.target.value }))} />
          <MathInput placeholder="Bonus (optional)" value={form.bonusPayout} onChange={e => setForm(f => ({ ...f, bonusPayout: e.target.value }))} />
          <input placeholder="Notes (optional)" className="col-span-3" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </div>
        <Button className="mt-2" size="sm" onClick={() => {
          if (!form.agreedPayout) return;
          add.mutate({
            runId,
            cargoType: form.cargoType || undefined,
            scuAmount: form.scuAmount ? Number(form.scuAmount) : undefined,
            pickupLocation: form.pickupLocation || undefined,
            deliveryLocation: form.deliveryLocation || undefined,
            agreedPayout: Number(form.agreedPayout),
            bonusPayout: Number(form.bonusPayout) || 0,
            notes: form.notes || undefined,
          });
          setForm({ cargoType: '', scuAmount: '', pickupLocation: '', deliveryLocation: '', agreedPayout: '', bonusPayout: '', notes: '' });
        }}><Plus size={13} /> Add Contract</Button>
      </Card>

      {(jobs as any[]).length > 0 && (
        <div className="space-y-3">
          {(jobs as any[]).map((j: any) => (
            <Card key={j.id}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <span className="font-semibold text-slate-200">{j.cargo_type || 'Unnamed cargo'}</span>
                  {j.scu_amount != null && (
                    <span className="ml-2 text-sm text-slate-400">{j.scu_amount} SCU</span>
                  )}
                  {(j.pickup_location || j.delivery_location) && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      {j.pickup_location || '?'} → {j.delivery_location || '?'}
                    </p>
                  )}
                  {j.notes && <p className="text-xs text-slate-500 italic mt-0.5">{j.notes}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge label={j.status} />
                  <Button variant="danger" size="sm" onClick={() => remove.mutate(j.id)}>
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Payout</p>
                  <p className="text-emerald-400 font-semibold">{fmtCurrency(j.agreed_payout, currency)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Bonus</p>
                  <p className="text-amber-400">{j.bonus_payout ? fmtCurrency(j.bonus_payout, currency) : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Total</p>
                  <p className="text-emerald-400">{fmtCurrency(j.agreed_payout + (j.bonus_payout || 0), currency)}</p>
                </div>
              </div>

              {j.status !== 'delivered' && NEXT_STATUS[j.status] && (
                <div className="mt-2 pt-2 border-t border-[#1e2d4f]">
                  <Button
                    size="sm"
                    variant={j.status === 'in_transit' ? 'primary' : 'secondary'}
                    onClick={() => advance.mutate({ id: j.id, status: NEXT_STATUS[j.status] })}
                  >
                    <CheckCircle size={12} /> {NEXT_LABEL[j.status]}
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sub-panel: Crafting ──────────────────────────────────────────────────────
function CraftingPanel({ runId, currency }: { runId: number; currency: string }) {
  const qc = useQueryClient();
  const { data: jobs = [] } = useQuery({ queryKey: ['crafting', runId], queryFn: () => craftingApi.getForRun(runId) });

  const [jobForm, setJobForm] = useState({ outputItem: '', outputQuantity: '', estimatedValue: '' });
  const [inputForms, setInputForms] = useState<{ [jobId: number]: { material: string; quantityRequired: string; costPerUnit: string } }>({});

  const addJob = useMutation({
    mutationFn: (d: unknown) => craftingApi.createJob(d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crafting', runId] }),
  });
  const removeJob = useMutation({
    mutationFn: (id: number) => craftingApi.removeJob(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['crafting', runId] }); qc.invalidateQueries({ queryKey: ['run', runId] }); },
  });
  const completeJob = useMutation({
    mutationFn: (id: number) => craftingApi.updateJob(id, { status: 'complete', completedAt: new Date().toISOString() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crafting', runId] }),
  });
  const addInput = useMutation({
    mutationFn: ({ jobId, d }: { jobId: number; d: unknown }) => craftingApi.addInput(jobId, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crafting', runId] }),
  });
  const removeInput = useMutation({
    mutationFn: (id: number) => craftingApi.removeInput(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crafting', runId] }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>New Crafting Job</CardTitle></CardHeader>
        <div className="grid grid-cols-3 gap-2">
          <input placeholder="Output item" value={jobForm.outputItem} onChange={e => setJobForm(f => ({ ...f, outputItem: e.target.value }))} />
          <MathInput placeholder="Output quantity" value={jobForm.outputQuantity} onChange={e => setJobForm(f => ({ ...f, outputQuantity: e.target.value }))} />
          <MathInput placeholder="Est. sell value" value={jobForm.estimatedValue} onChange={e => setJobForm(f => ({ ...f, estimatedValue: e.target.value }))} />
        </div>
        <Button className="mt-2" size="sm" onClick={() => {
          if (!jobForm.outputItem || !jobForm.outputQuantity) return;
          addJob.mutate({ runId, outputItem: jobForm.outputItem, outputQuantity: Number(jobForm.outputQuantity), estimatedValue: jobForm.estimatedValue ? Number(jobForm.estimatedValue) : undefined });
          setJobForm({ outputItem: '', outputQuantity: '', estimatedValue: '' });
        }}><Plus size={13} /> Create Job</Button>
      </Card>

      {(jobs as any[]).map((job: any) => {
        const inf = inputForms[job.id] || { material: '', quantityRequired: '', costPerUnit: '' };
        const totalInputCost = (job.inputs || []).reduce((s: number, i: any) => s + (i.total_cost ?? 0), 0);
        const margin = job.estimated_value != null ? job.estimated_value - totalInputCost : null;
        return (
          <Card key={job.id}>
            <div className="flex items-start justify-between mb-2">
              <div>
                <span className="font-semibold text-slate-200">{job.output_item}</span>
                <span className="ml-2 text-sm text-slate-400">× {job.output_quantity}</span>
              </div>
              <div className="flex gap-2 items-center">
                <Badge label={job.status} />
                {job.status !== 'complete' && (
                  <Button size="sm" variant="secondary" onClick={() => completeJob.mutate(job.id)}>
                    <CheckCircle size={12} /> Complete
                  </Button>
                )}
                <Button variant="danger" size="sm" onClick={() => removeJob.mutate(job.id)}><Trash2 size={12} /></Button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm mb-3">
              <div><p className="text-xs text-slate-500">Input cost</p><p className="text-red-400">{fmtCurrency(totalInputCost, currency)}</p></div>
              <div><p className="text-xs text-slate-500">Est. value</p><p className="text-slate-200">{job.estimated_value != null ? fmtCurrency(job.estimated_value, currency) : '—'}</p></div>
              <div><p className="text-xs text-slate-500">Est. margin</p><p className={margin != null ? profitColor(margin) : 'text-slate-500'}>{margin != null ? fmtCurrency(margin, currency) : '—'}</p></div>
            </div>

            {/* Inputs table */}
            {(job.inputs || []).length > 0 && (
              <Table>
                <thead><tr><Th>Material</Th><Th>Qty Req.</Th><Th>Cost/unit</Th><Th>Total</Th><Th /></tr></thead>
                <tbody>
                  {(job.inputs as any[]).map((inp: any) => (
                    <Tr key={inp.id}>
                      <Td>{inp.material}</Td>
                      <Td>{inp.quantity_required}</Td>
                      <Td className="text-slate-400">{inp.cost_per_unit != null ? fmtCurrency(inp.cost_per_unit, currency) : '—'}</Td>
                      <Td className="text-red-400">{inp.total_cost != null ? fmtCurrency(inp.total_cost, currency) : '—'}</Td>
                      <Td><Button variant="danger" size="sm" onClick={() => removeInput.mutate(inp.id)}><Trash2 size={12} /></Button></Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}

            {/* Add input */}
            <div className="flex gap-2 mt-2">
              <input placeholder="Material" value={inf.material} onChange={ev => setInputForms(f => ({ ...f, [job.id]: { ...f[job.id], material: ev.target.value } }))} />
              <MathInput placeholder="Qty" className="w-20" value={inf.quantityRequired} onChange={ev => setInputForms(f => ({ ...f, [job.id]: { ...f[job.id], quantityRequired: ev.target.value } }))} />
              <MathInput placeholder="Cost/unit" className="w-24" value={inf.costPerUnit} onChange={ev => setInputForms(f => ({ ...f, [job.id]: { ...f[job.id], costPerUnit: ev.target.value } }))} />
              <Button size="sm" variant="secondary" onClick={() => {
                if (!inf.material || !inf.quantityRequired) return;
                addInput.mutate({ jobId: job.id, d: { material: inf.material, quantityRequired: Number(inf.quantityRequired), costPerUnit: inf.costPerUnit ? Number(inf.costPerUnit) : undefined } });
                setInputForms(f => ({ ...f, [job.id]: { material: '', quantityRequired: '', costPerUnit: '' } }));
              }}><Plus size={12} /> Input</Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Sub-panel: Expenses ──────────────────────────────────────────────────────
function ExpensesPanel({ runId, currency }: { runId: number; currency: string }) {
  const qc = useQueryClient();
  const { data: expenses = [] } = useQuery({ queryKey: ['expenses', runId], queryFn: () => expensesApi.list({ runId }) });
  const [form, setForm] = useState({ category: 'fuel', itemName: '', quantity: '', unitPrice: '', notes: '' });

  const add = useMutation({
    mutationFn: (d: unknown) => expensesApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses', runId] }); qc.invalidateQueries({ queryKey: ['run', runId] }); },
  });
  const remove = useMutation({
    mutationFn: (id: number) => expensesApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses', runId] }); qc.invalidateQueries({ queryKey: ['run', runId] }); },
  });

  const runningTotal = (expenses as any[]).reduce((s: number, e: any) => s + e.amount, 0);

  const qty = Number(form.quantity) || 1;
  const unitPrice = Number(form.unitPrice) || 0;
  const lineTotal = qty * unitPrice;
  const showTotal = unitPrice > 0 && Number(form.quantity) > 1;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Add Expense / Investment</CardTitle>
          <span className="text-sm text-red-400 font-semibold">Total: {fmtCurrency(runningTotal, currency)}</span>
        </CardHeader>
        <div className="grid grid-cols-5 gap-2">
          <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
            {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input placeholder="Item name (e.g. Rieger C3)" value={form.itemName} onChange={e => setForm(f => ({ ...f, itemName: e.target.value }))} />
          <MathInput placeholder="Qty (optional)" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
          <MathInput placeholder="Unit price" value={form.unitPrice} onChange={e => setForm(f => ({ ...f, unitPrice: e.target.value }))} />
          <input placeholder="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </div>
        <div className="flex items-center gap-4 mt-2">
          <Button size="sm" onClick={() => {
            if (!form.unitPrice) return;
            add.mutate({ runId, category: form.category, itemName: form.itemName || undefined, amount: lineTotal, notes: form.notes || undefined });
            setForm({ category: 'fuel', itemName: '', quantity: '', unitPrice: '', notes: '' });
          }}><Plus size={13} /> Add</Button>
          {showTotal && (
            <span className="text-sm text-slate-400">
              {Number(form.quantity).toLocaleString()} × {fmtCurrency(unitPrice, currency)}
              {' = '}
              <span className="text-red-400 font-semibold">{fmtCurrency(lineTotal, currency)}</span>
            </span>
          )}
        </div>
      </Card>

      {(expenses as any[]).length > 0 && (
        <Table>
          <thead><tr><Th>Category</Th><Th>Item</Th><Th>Amount</Th><Th>Date</Th><Th /></tr></thead>
          <tbody>
            {(expenses as any[]).map((e: any) => (
              <Tr key={e.id}>
                <Td><Badge label={e.category} /></Td>
                <Td className="text-slate-300">{e.item_name || '—'}</Td>
                <Td className="text-red-400 font-semibold">{fmtCurrency(e.amount, currency)}</Td>
                <Td className="text-slate-500 text-xs">{e.date}</Td>
                <Td><Button variant="danger" size="sm" onClick={() => remove.mutate(e.id)}><Trash2 size={12} /></Button></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

// ─── Sub-panel: Crew Payouts ──────────────────────────────────────────────────
function CrewPanel({ runId, currency, profit, playerCrewMemberId }: {
  runId: number;
  currency: string;
  profit: number;
  playerCrewMemberId: number | null;
}) {
  const qc = useQueryClient();
  const { data: crewList = [] } = useQuery({ queryKey: ['run-crew', runId], queryFn: () => runsApi.getCrew(runId) });
  const { data: allCrew = [] } = useQuery({ queryKey: ['crew'], queryFn: () => crewApi.list() });

  const [form, setForm] = useState({ crewMemberId: '', role: '', payoutType: 'percentage', payoutValue: '' });

  const add = useMutation({
    mutationFn: (d: unknown) => runsApi.addCrew(runId, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['run-crew', runId] }),
  });
  const settle = useMutation({
    mutationFn: ({ id, amount }: { id: number; amount: number }) =>
      runsApi.updateCrew(runId, id, { payoutSettled: true, actualPayout: amount }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['run-crew', runId] }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => runsApi.removeCrew(runId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['run-crew', runId] }),
  });

  const calcPayout = (c: any) => {
    if (c.payout_type === 'percentage') return (profit * c.payout_value) / 100;
    return c.payout_value;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Add Crew Member</CardTitle></CardHeader>
        <div className="grid grid-cols-4 gap-2">
          <select value={form.crewMemberId} onChange={e => setForm(f => ({ ...f, crewMemberId: e.target.value }))}>
            <option value="">Select member</option>
            {(allCrew as any[]).map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <input placeholder="Role (e.g. Pilot)" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} />
          <select value={form.payoutType} onChange={e => setForm(f => ({ ...f, payoutType: e.target.value }))}>
            <option value="percentage">% of profit</option>
            <option value="fixed">Fixed amount</option>
          </select>
          <MathInput placeholder={form.payoutType === 'percentage' ? '25 (%)' : '50000'} value={form.payoutValue} onChange={e => setForm(f => ({ ...f, payoutValue: e.target.value }))} />
        </div>
        <Button className="mt-2" size="sm" onClick={() => {
          if (!form.crewMemberId) return;
          add.mutate({ crewMemberId: Number(form.crewMemberId), role: form.role || undefined, payoutType: form.payoutType, payoutValue: Number(form.payoutValue) || 0 });
          setForm({ crewMemberId: '', role: '', payoutType: 'percentage', payoutValue: '' });
        }}><Plus size={13} /> Add</Button>
      </Card>

      <p className="text-xs text-slate-500">Run profit: <span className={profitColor(profit)}>{fmtCurrency(profit, currency)}</span></p>

      {(crewList as any[]).length > 0 && (
        <Table>
          <thead><tr><Th>Member</Th><Th>Role</Th><Th>Payout</Th><Th>Calculated</Th><Th>Settled</Th><Th /></tr></thead>
          <tbody>
            {[...(crewList as any[])]
              .sort((a, b) => {
                // Player row first
                const aIsPlayer = a.crew_member_id === playerCrewMemberId;
                const bIsPlayer = b.crew_member_id === playerCrewMemberId;
                if (aIsPlayer && !bIsPlayer) return -1;
                if (!aIsPlayer && bIsPlayer) return 1;
                return 0;
              })
              .map((c: any) => {
                const calc = calcPayout(c);
                const isPlayer = c.crew_member_id === playerCrewMemberId;
                return (
                  <Tr key={c.id} className={isPlayer ? 'bg-amber-900/10' : ''}>
                    <Td className="font-medium text-slate-200">
                      <span className="flex items-center gap-1.5">
                        <Link
                          to={`/crew/${c.crew_member_id}`}
                          className="hover:text-blue-300 transition-colors"
                        >
                          {c.member_name}
                        </Link>
                        {isPlayer && (
                          <span className="inline-flex items-center gap-0.5 text-xs px-1 py-0.5 rounded bg-amber-500/20 text-amber-400">
                            <Star size={9} className="fill-amber-400" /> you
                          </span>
                        )}
                      </span>
                    </Td>
                    <Td className="text-slate-500">{c.role || '—'}</Td>
                    <Td>{c.payout_type === 'percentage' ? `${c.payout_value}% of profit` : fmtCurrency(c.payout_value, currency)}</Td>
                    <Td className={isPlayer ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>{fmtCurrency(calc, currency)}</Td>
                    <Td>
                      {c.payout_settled
                        ? <span className="text-emerald-400 text-xs">✓ {fmtCurrency(c.actual_payout, currency)}</span>
                        : <Button size="sm" variant="secondary" onClick={() => settle.mutate({ id: c.id, amount: calc })}>
                            <CheckCircle size={12} /> Mark paid
                          </Button>
                      }
                    </Td>
                    <Td><Button variant="danger" size="sm" onClick={() => remove.mutate(c.id)}><Trash2 size={12} /></Button></Td>
                  </Tr>
                );
              })}
          </tbody>
        </Table>
      )}
    </div>
  );
}

// ─── Contract "your cut" summary (always visible, shares query key with expanded section) ──
function ContractYourCut({ contractId, contractTotal, currency, playerCrewMemberId, isShared, sharedPlayerCount }: {
  contractId: number;
  contractTotal: number;
  currency: string;
  playerCrewMemberId: number | null;
  isShared: boolean;
  sharedPlayerCount: number | null;
}) {
  const { data: crew = [] } = useQuery({
    queryKey: ['contract-crew', contractId],
    queryFn: () => contractsApi.getCrew(contractId),
    enabled: !!playerCrewMemberId && !isShared,
  });

  if (!playerCrewMemberId) return null;

  // Shared contract: game splits equally, user gets 1/N
  if (isShared && sharedPlayerCount && sharedPlayerCount > 0) {
    const myCut = contractTotal / sharedPlayerCount;
    return (
      <div className="flex items-center gap-1.5 text-xs">
        <Star size={10} className="fill-amber-400 text-amber-400 shrink-0" />
        <span className="text-slate-500">Your cut:</span>
        <span className={`font-semibold ${profitColor(myCut)}`}>{fmtCurrency(myCut, currency)}</span>
        <span className="text-slate-600">· game splits {sharedPlayerCount} ways</span>
      </div>
    );
  }

  const calcPayout = (c: any) =>
    c.payout_type === 'percentage' ? (contractTotal * c.payout_value) / 100 : c.payout_value;

  const nonPlayerCrew = (crew as any[]).filter((c: any) => c.crew_member_id !== playerCrewMemberId);
  const playerEntry = (crew as any[]).find((c: any) => c.crew_member_id === playerCrewMemberId);
  const othersPaid = nonPlayerCrew.reduce((s: number, c: any) => s + calcPayout(c), 0);
  const myCut = playerEntry ? calcPayout(playerEntry) : contractTotal - othersPaid;

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <Star size={10} className="fill-amber-400 text-amber-400 shrink-0" />
      <span className="text-slate-500">Your cut:</span>
      <span className={`font-semibold ${profitColor(myCut)}`}>{fmtCurrency(myCut, currency)}</span>
      {othersPaid > 0 && (
        <span className="text-slate-600">· paying out {fmtCurrency(othersPaid, currency)} to crew</span>
      )}
    </div>
  );
}

// ─── Sub-panel: Contract crew ─────────────────────────────────────────────────
function ContractCrewSection({
  contractId, contractTotal, currency, runCrew, playerCrewMemberId, isShared,
}: {
  contractId: number;
  contractTotal: number;
  currency: string;
  runCrew: any[];
  playerCrewMemberId: number | null;
  isShared: boolean;
}) {
  const qc = useQueryClient();
  const { data: crew = [] } = useQuery({
    queryKey: ['contract-crew', contractId],
    queryFn: () => contractsApi.getCrew(contractId),
  });
  const [addForm, setAddForm] = useState({ crewMemberId: '', payoutType: 'percentage', payoutValue: '' });

  const addCrew = useMutation({
    mutationFn: (d: unknown) => contractsApi.addCrew(contractId, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contract-crew', contractId] }),
  });
  const removeCrew = useMutation({
    mutationFn: (rowId: number) => contractsApi.removeCrew(contractId, rowId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contract-crew', contractId] }),
  });
  const settleCrew = useMutation({
    mutationFn: ({ rowId, amount }: { rowId: number; amount: number }) =>
      contractsApi.updateCrew(contractId, rowId, { payoutSettled: true, actualPayout: amount }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contract-crew', contractId] }),
  });

  const calcPayout = (c: any) =>
    c.payout_type === 'percentage' ? (contractTotal * c.payout_value) / 100 : c.payout_value;

  return (
    <div className="space-y-1.5">
      {(crew as any[]).map((c: any) => {
        const calc = calcPayout(c);
        return (
          <div key={c.id} className={`flex items-center justify-between text-sm rounded-lg px-3 py-2 ${c.crew_member_id === playerCrewMemberId ? 'bg-amber-900/15' : 'bg-[#0f1629]'}`}>
            <div>
              <span className="text-slate-200 font-medium">{c.member_name}</span>
              {c.crew_member_id === playerCrewMemberId && (
                <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs px-1 py-0.5 rounded bg-amber-500/20 text-amber-400">
                  <Star size={9} className="fill-amber-400" /> you
                </span>
              )}
              {c.role && <span className="ml-1.5 text-xs text-slate-500">{c.role}</span>}
              <span className="ml-2 text-xs text-slate-500">
                {c.payout_type === 'percentage' ? `${c.payout_value}% of contract` : fmtCurrency(c.payout_value, currency)}
                {' → '}<span className="text-amber-400">{fmtCurrency(calc, currency)}</span>
              </span>
            </div>
            <div className="flex items-center gap-1">
              {c.payout_settled
                ? <span className="text-emerald-400 text-xs mr-1">✓ {fmtCurrency(c.actual_payout, currency)}</span>
                : isShared
                  ? <span className="text-xs text-slate-500 mr-1">game auto-pays</span>
                  : <Button size="sm" variant="secondary" onClick={() => settleCrew.mutate({ rowId: c.id, amount: calc })}>
                      <CheckCircle size={11} /> Settle
                    </Button>
              }
              <Button size="sm" variant="danger" onClick={() => removeCrew.mutate(c.id)}><Trash2 size={11} /></Button>
            </div>
          </div>
        );
      })}

      {/* Add from run crew pool */}
      <div className="flex gap-2 flex-wrap pt-1">
        <select
          className="text-xs"
          value={addForm.crewMemberId}
          onChange={e => setAddForm(f => ({ ...f, crewMemberId: e.target.value }))}
        >
          <option value="">Add from run crew…</option>
          {runCrew.map((m: any) => (
            <option key={m.id} value={m.crew_member_id}>{m.member_name}</option>
          ))}
        </select>
        <select
          className="text-xs w-32"
          value={addForm.payoutType}
          onChange={e => setAddForm(f => ({ ...f, payoutType: e.target.value }))}
        >
          <option value="percentage">% of contract</option>
          <option value="fixed">Fixed amount</option>
        </select>
        <input
          type="number"
          className="text-xs w-20"
          placeholder={addForm.payoutType === 'percentage' ? '% share' : 'Amount'}
          value={addForm.payoutValue}
          onChange={e => setAddForm(f => ({ ...f, payoutValue: e.target.value }))}
        />
        <Button size="sm" variant="secondary" onClick={() => {
          if (!addForm.crewMemberId) return;
          addCrew.mutate({
            crewMemberId: Number(addForm.crewMemberId),
            payoutType: addForm.payoutType,
            payoutValue: Number(addForm.payoutValue) || 0,
          });
          setAddForm({ crewMemberId: '', payoutType: 'percentage', payoutValue: '' });
        }}><Plus size={11} /> Add</Button>
      </div>
    </div>
  );
}

// ─── Sub-panel: Contracts ─────────────────────────────────────────────────────
function ContractsPanel({ runId, currency, gameId, playerCrewMemberId }: {
  runId: number;
  currency: string;
  gameId: number;
  playerCrewMemberId: number | null;
}) {
  const qc = useQueryClient();
  const { data: contracts = [] } = useQuery({ queryKey: ['contracts', runId], queryFn: () => contractsApi.getForRun(runId) });
  const { data: runCrew = [] } = useQuery({ queryKey: ['run-crew', runId], queryFn: () => runsApi.getCrew(runId) });
  const { data: clientSuggestions = [] } = useQuery({
    queryKey: ['contract-clients', gameId],
    queryFn: () => contractsApi.getClients(gameId),
  });

  const [form, setForm] = useState({
    type: 'combat', clientName: '', description: '', agreedPayout: '', bonusPayout: '',
    cargoType: '', scuAmount: '', pickupLocation: '', deliveryLocation: '',
    isShared: false, sharedPlayerCount: '',
  });
  const [expandedCrewId, setExpandedCrewId] = useState<number | null>(null);
  const [showClosedContracts, setShowClosedContracts] = useState(false);

  const add = useMutation({
    mutationFn: (d: unknown) => contractsApi.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contracts', runId] });
      qc.invalidateQueries({ queryKey: ['run', runId] });
      qc.invalidateQueries({ queryKey: ['contract-clients', gameId] });
    },
  });
  const complete = useMutation({
    mutationFn: (id: number) => contractsApi.complete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contracts', runId] });
      qc.invalidateQueries({ queryKey: ['run', runId] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => contractsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contracts', runId] });
      qc.invalidateQueries({ queryKey: ['run', runId] });
    },
  });

  const isHauling = form.type === 'hauling';
  const activeContracts = (contracts as any[]).filter((c: any) => c.status === 'active');
  const closedContracts = (contracts as any[]).filter((c: any) => c.status !== 'active');
  const completedTotal = closedContracts
    .filter((c: any) => c.status === 'complete')
    .reduce((s: number, c: any) => s + c.agreed_payout + (c.bonus_payout || 0), 0);

  return (
    <div className="space-y-4">
      {/* Running totals */}
      {(contracts as any[]).length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Active" value={String(activeContracts.length)} />
          <StatCard label="Earned" value={fmtCurrency(completedTotal, currency)} trend="up" />
          <StatCard label="Total" value={String((contracts as any[]).length)} />
        </div>
      )}

      {/* Add contract form */}
      <Card>
        <CardHeader><CardTitle>Add Contract</CardTitle></CardHeader>
        <datalist id="contract-clients">
          {(clientSuggestions as string[]).map(name => <option key={name} value={name} />)}
        </datalist>
        <div className="grid grid-cols-3 gap-2">
          <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
            {CONTRACT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input
            list="contract-clients"
            placeholder="Client name"
            value={form.clientName}
            onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))}
          />
          <input placeholder="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          <MathInput placeholder="Agreed payout" value={form.agreedPayout} onChange={e => setForm(f => ({ ...f, agreedPayout: e.target.value }))} />
          <MathInput placeholder="Bonus (optional)" value={form.bonusPayout} onChange={e => setForm(f => ({ ...f, bonusPayout: e.target.value }))} />
          {/* Shared contract toggle */}
          <div className="col-span-3 flex items-center gap-4 py-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-4 h-4 accent-blue-500"
                checked={form.isShared}
                onChange={e => setForm(f => ({ ...f, isShared: e.target.checked }))}
              />
              <span className="text-sm text-slate-300">Shared contract</span>
              <span className="text-xs text-slate-500">(game auto-splits payout equally)</span>
            </label>
            {form.isShared && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400">Players (inc. you):</label>
                <input
                  type="number"
                  min="2"
                  placeholder="e.g. 4"
                  className="w-20 text-sm"
                  value={form.sharedPlayerCount}
                  onChange={e => setForm(f => ({ ...f, sharedPlayerCount: e.target.value }))}
                />
              </div>
            )}
          </div>
          {isHauling && (
            <div className="col-span-3 border-t border-[#1e2d4f] pt-2">
              <p className="text-xs text-slate-500 mb-2">Hauling details</p>
              <div className="grid grid-cols-3 gap-2">
                <input placeholder="Cargo type (e.g. Medical Supplies)" value={form.cargoType} onChange={e => setForm(f => ({ ...f, cargoType: e.target.value }))} />
                <MathInput placeholder="SCU amount" value={form.scuAmount} onChange={e => setForm(f => ({ ...f, scuAmount: e.target.value }))} />
                <div />
                <input placeholder="Pickup location" value={form.pickupLocation} onChange={e => setForm(f => ({ ...f, pickupLocation: e.target.value }))} />
                <input placeholder="Delivery location" value={form.deliveryLocation} onChange={e => setForm(f => ({ ...f, deliveryLocation: e.target.value }))} />
              </div>
            </div>
          )}
        </div>
        <Button className="mt-2" size="sm" onClick={() => {
          if (!form.agreedPayout) return;
          add.mutate({
            runId, type: form.type,
            clientName: form.clientName || undefined,
            description: form.description || undefined,
            agreedPayout: Number(form.agreedPayout),
            bonusPayout: Number(form.bonusPayout) || 0,
            isShared: form.isShared,
            sharedPlayerCount: form.isShared && form.sharedPlayerCount ? Number(form.sharedPlayerCount) : undefined,
            ...(isHauling && {
              cargoType: form.cargoType || undefined,
              scuAmount: form.scuAmount ? Number(form.scuAmount) : undefined,
              pickupLocation: form.pickupLocation || undefined,
              deliveryLocation: form.deliveryLocation || undefined,
            }),
          });
          setForm({ type: 'combat', clientName: '', description: '', agreedPayout: '', bonusPayout: '', cargoType: '', scuAmount: '', pickupLocation: '', deliveryLocation: '', isShared: false, sharedPlayerCount: '' });
        }}><Plus size={13} /> Add</Button>
      </Card>

      {/* Active contract cards */}
      {activeContracts.length === 0 && closedContracts.length === 0 && (
        <p className="text-sm text-slate-500">No contracts yet.</p>
      )}
      {activeContracts.length === 0 && closedContracts.length > 0 && (
        <p className="text-sm text-slate-500">No open contracts.</p>
      )}

      {activeContracts.map((c: any) => {
        const total = c.agreed_payout + (c.bonus_payout || 0);
        const crewExpanded = expandedCrewId === c.id;
        const isShared = !!c.is_shared;
        const sharedN: number | null = c.shared_player_count ?? null;
        return (
          <Card key={c.id}>
            {/* Header row */}
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge label={c.type} />
                  <span className="font-semibold text-slate-200">{c.client_name || 'Unknown client'}</span>
                  <Badge label={c.status} />
                  {isShared && (
                    <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-medium">
                      SHARED{sharedN ? ` · ${sharedN}` : ''}
                    </span>
                  )}
                </div>
                {c.description && <p className="text-xs text-slate-500 mt-0.5">{c.description}</p>}
                {c.type === 'hauling' && (c.cargo_type || c.scu_amount) && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    {c.cargo_type}{c.scu_amount != null ? ` · ${c.scu_amount} SCU` : ''}
                    {c.pickup_location && ` · ${c.pickup_location} → ${c.delivery_location || '?'}`}
                  </p>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                {c.status === 'active' && (
                  <Button size="sm" variant="secondary" onClick={() => complete.mutate(c.id)}>
                    <CheckCircle size={12} /> Complete
                  </Button>
                )}
                <Button variant="danger" size="sm" onClick={() => remove.mutate(c.id)}><Trash2 size={12} /></Button>
              </div>
            </div>

            {/* Payout summary */}
            <div className="grid grid-cols-3 gap-3 text-sm mb-2">
              <div><p className="text-xs text-slate-500">Payout</p><p className="text-emerald-400 font-semibold">{fmtCurrency(c.agreed_payout, currency)}</p></div>
              <div><p className="text-xs text-slate-500">Bonus</p><p className="text-amber-400">{c.bonus_payout ? fmtCurrency(c.bonus_payout, currency) : '—'}</p></div>
              <div><p className="text-xs text-slate-500">Total</p><p className="text-emerald-400 font-semibold">{fmtCurrency(total, currency)}</p></div>
            </div>

            {/* Your cut (always visible when player is defined) */}
            <ContractYourCut
              contractId={c.id}
              contractTotal={total}
              currency={currency}
              playerCrewMemberId={playerCrewMemberId}
              isShared={isShared}
              sharedPlayerCount={sharedN}
            />

            {/* Crew section (collapsible) */}
            <div className="border-t border-[#1e2d4f] pt-2 mt-2">
              <button
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors mb-2"
                onClick={() => setExpandedCrewId(crewExpanded ? null : c.id)}
              >
                <Users size={11} />
                <span>Crew</span>
                <ChevronRight size={11} className={`transition-transform duration-150 ${crewExpanded ? 'rotate-90' : ''}`} />
              </button>
              {crewExpanded && (
                <ContractCrewSection
                  contractId={c.id}
                  contractTotal={total}
                  currency={currency}
                  runCrew={runCrew as any[]}
                  playerCrewMemberId={playerCrewMemberId}
                  isShared={isShared}
                />
              )}
            </div>
          </Card>
        );
      })}

      {/* Closed contracts (completed / failed) — collapsible archive */}
      {closedContracts.length > 0 && (
        <div>
          <button
            onClick={() => setShowClosedContracts(v => !v)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors py-1"
          >
            <ChevronRight size={11} className={`transition-transform duration-150 ${showClosedContracts ? 'rotate-90' : ''}`} />
            {showClosedContracts ? 'Hide' : 'Show'} {closedContracts.length} closed contract{closedContracts.length !== 1 ? 's' : ''}
            <span className="ml-1 text-emerald-500">{fmtCurrency(completedTotal, currency)}</span>
          </button>

          {showClosedContracts && (
            <div className="space-y-3 mt-2">
              {closedContracts.map((c: any) => {
                const total = c.agreed_payout + (c.bonus_payout || 0);
                return (
                  <Card key={c.id} className="opacity-70">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge label={c.type} />
                          <span className="font-semibold text-slate-300">{c.client_name || 'Unknown client'}</span>
                          <Badge label={c.status} />
                        </div>
                        {c.description && <p className="text-xs text-slate-600 mt-0.5">{c.description}</p>}
                      </div>
                      <Button variant="danger" size="sm" onClick={() => remove.mutate(c.id)}><Trash2 size={12} /></Button>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div><p className="text-xs text-slate-500">Payout</p><p className="text-emerald-400">{fmtCurrency(c.agreed_payout, currency)}</p></div>
                      <div><p className="text-xs text-slate-500">Bonus</p><p className="text-amber-400">{c.bonus_payout ? fmtCurrency(c.bonus_payout, currency) : '—'}</p></div>
                      <div><p className="text-xs text-slate-500">Total</p><p className="text-emerald-400 font-semibold">{fmtCurrency(total, currency)}</p></div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Delete Run confirmation modal ────────────────────────────────────────────
function DeleteRunModal({ runId, runTitle, open, onClose }: { runId: number; runTitle: string; open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: () => runsApi.remove(runId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['runs'] });
      navigate('/runs');
    },
  });
  return (
    <Modal open={open} onClose={onClose} title="Delete Run">
      <div className="space-y-4">
        <div className="flex gap-3 items-start">
          <AlertTriangle size={20} className="text-red-400 mt-0.5 shrink-0" />
          <p className="text-sm text-slate-300">
            Permanently delete <strong className="text-slate-100">"{runTitle}"</strong>?
            All mining entries, refining jobs, trading entries, crafting jobs, contracts, expenses, and crew assignments will be removed.
            This cannot be undone.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={() => del.mutate()} disabled={del.isPending}>
            <Trash2 size={13} /> {del.isPending ? 'Deleting…' : 'Delete Run'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Main RunDetail page ──────────────────────────────────────────────────────
const TABS = ['overview', 'mining', 'refining', 'trading', 'hauling', 'crafting', 'contracts', 'expenses', 'crew'] as const;
type Tab = typeof TABS[number];

export function RunDetail() {
  const { id } = useParams<{ id: string }>();
  const runId = Number(id);
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('overview');
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: run, isLoading } = useQuery({ queryKey: ['run', runId], queryFn: () => runsApi.get(runId) });
  const { data: allCrew = [] } = useQuery({ queryKey: ['crew'], queryFn: () => crewApi.list() });

  const completeMut = useMutation({
    mutationFn: () => runsApi.complete(runId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['run', runId] }),
  });
  const reopenMut = useMutation({
    mutationFn: () => runsApi.update(runId, { status: 'active' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['run', runId] });
      qc.invalidateQueries({ queryKey: ['runs'] });
    },
  });

  if (isLoading) return <div className="text-slate-500 p-8">Loading…</div>;
  if (!run) return <div className="text-red-400 p-8">Run not found</div>;

  const r = run as any;
  const currency = r.currency || 'UEC';

  // ── Player identity & My Earnings ──────────────────────────────────────────
  const playerCrewMember = (allCrew as any[]).find((m: any) => m.is_player === 1);
  const playerCrewMemberId: number | null = playerCrewMember?.id ?? null;

  const calcRunCrewPayout = (c: any) =>
    c.payout_type === 'percentage' ? (r.profit * c.payout_value) / 100 : c.payout_value;

  const nonPlayerRunCrew = (r.crew || []).filter((c: any) => c.crew_member_id !== playerCrewMemberId);
  const playerRunCrewEntry = playerCrewMemberId
    ? (r.crew || []).find((c: any) => c.crew_member_id === playerCrewMemberId)
    : null;

  const otherCrewTotal = nonPlayerRunCrew.reduce(
    (s: number, c: any) => s + calcRunCrewPayout(c), 0
  );
  // My net: if I have an explicit payout entry use that; otherwise take the remainder after paying others
  const myNet = playerRunCrewEntry
    ? calcRunCrewPayout(playerRunCrewEntry)
    : r.profit - otherCrewTotal;

  const unsettledOtherCrew = nonPlayerRunCrew.filter((c: any) => !c.payout_settled);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link to="/runs" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-300 mb-2">
            <ChevronLeft size={14} /> All Runs
          </Link>
          <h1 className="text-2xl font-bold text-slate-100">{r.title || `Run #${r.id}`}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge label={r.type} />
            <Badge label={r.status} />
            <span className="text-sm text-slate-500">{r.game_name}</span>
            {r.vehicle_name && <span className="text-sm text-slate-500">· {r.vehicle_name}</span>}
            {r.location && <span className="text-sm text-slate-500">· {r.location}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          {r.status === 'active' ? (
            <Button onClick={() => completeMut.mutate()} disabled={completeMut.isPending}>
              <CheckCircle size={14} /> End Run
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => reopenMut.mutate()} disabled={reopenMut.isPending}>
              <RotateCcw size={14} /> Reopen Run
            </Button>
          )}
          <Button variant="danger" onClick={() => setDeleteOpen(true)}>
            <Trash2 size={14} /> Delete
          </Button>
        </div>
      </div>

      {/* Timing */}
      <div className="flex items-center gap-4 text-sm text-slate-500">
        <span className="flex items-center gap-1"><Clock size={13} /> Started: {fmtDatetime(r.started_at)}</span>
        {r.ended_at && <span>Ended: {fmtDatetime(r.ended_at)}</span>}
        {r.durationHours != null && <span>Duration: <strong className="text-slate-300">{fmtDuration(r.durationHours)}</strong></span>}
      </div>

      {/* P&L summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Revenue" value={fmtCurrency(r.revenue, currency)} trend="up" />
        <StatCard label="Expenses" value={fmtCurrency(r.costs, currency)} trend="down" />
        <StatCard label="Net Profit" value={fmtCurrency(r.profit, currency)} trend={r.profit >= 0 ? 'up' : 'down'} />
        <StatCard
          label={r.durationHours ? `${currency}/hr` : 'Crew'}
          value={r.durationHours
            ? fmtCurrency(Math.round(r.profit / r.durationHours), currency)
            : `${(r.crew || []).length} member(s)`}
          sub={r.durationHours ? fmtDuration(r.durationHours) : undefined}
        />
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 border-b border-[#1e2d4f] overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px whitespace-nowrap ${
              tab === t
                ? 'border-blue-500 text-blue-300'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {tab === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle>Run Details</CardTitle></CardHeader>
                <dl className="space-y-2 text-sm">
                  {[
                    ['Game', r.game_name],
                    ['Vehicle', r.vehicle_name || '—'],
                    ['Location', r.location || '—'],
                    ['Notes', r.notes || '—'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <dt className="text-slate-500">{k}</dt>
                      <dd className="text-slate-200">{v}</dd>
                    </div>
                  ))}
                </dl>
              </Card>

              {/* My Earnings reconciliation — only shown when player is defined */}
              {playerCrewMemberId ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-1.5">
                      <Star size={13} className="fill-amber-400 text-amber-400" /> My Earnings
                    </CardTitle>
                  </CardHeader>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Revenue</span>
                      <span className="text-slate-200">{fmtCurrency(r.revenue, currency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Expenses</span>
                      <span className="text-red-400">−{fmtCurrency(r.costs, currency)}</span>
                    </div>
                    <div className="flex justify-between border-t border-[#1e2d4f] pt-1.5">
                      <span className="text-slate-400">Profit</span>
                      <span className={profitColor(r.profit)}>{fmtCurrency(r.profit, currency)}</span>
                    </div>
                    {otherCrewTotal > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">
                          Crew payouts
                          {nonPlayerRunCrew.length > 0 && (
                            <span className="ml-1 text-slate-600">({nonPlayerRunCrew.length})</span>
                          )}
                        </span>
                        <span className="text-red-400">−{fmtCurrency(otherCrewTotal, currency)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-[#1e2d4f] pt-1.5">
                      <span className="text-slate-200 font-semibold">Your net</span>
                      <span className={`font-bold text-base ${profitColor(myNet)}`}>{fmtCurrency(myNet, currency)}</span>
                    </div>
                    {unsettledOtherCrew.length > 0 && (
                      <p className="text-xs text-amber-500 pt-0.5">
                        ⏳ {unsettledOtherCrew.length} crew member{unsettledOtherCrew.length !== 1 ? 's' : ''} awaiting payout
                      </p>
                    )}
                  </div>
                </Card>
              ) : (
                <Card>
                  <CardHeader><CardTitle>Crew ({(r.crew || []).length})</CardTitle></CardHeader>
                  {(r.crew || []).length === 0 ? (
                    <p className="text-sm text-slate-500">No crew assigned.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {(r.crew || []).map((c: any) => (
                        <div key={c.id} className="flex items-center justify-between rounded-lg bg-[#0f1629] px-3 py-2">
                          <div>
                            <span className="text-sm font-medium text-slate-200">{c.member_name}</span>
                            {c.role && <span className="ml-2 text-xs text-slate-500">{c.role}</span>}
                          </div>
                          <span className="text-xs text-amber-400">
                            {c.payout_type === 'percentage' ? `${c.payout_value}%` : fmtCurrency(c.payout_value, currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-slate-600 mt-3 pt-2 border-t border-[#1e2d4f]">
                    <Link to="/crew" className="text-blue-500 hover:text-blue-400">Mark yourself on the Crew page</Link> to see your personal earnings.
                  </p>
                </Card>
              )}
            </div>
          </div>
        )}
        {tab === 'mining' && <MiningPanel runId={runId} currency={currency} />}
        {tab === 'refining' && <RefiningPanel runId={runId} currency={currency} />}
        {tab === 'trading' && <TradingPanel runId={runId} currency={currency} />}
        {tab === 'hauling' && <HaulingPanel runId={runId} currency={currency} />}
        {tab === 'crafting' && <CraftingPanel runId={runId} currency={currency} />}
        {tab === 'contracts' && <ContractsPanel runId={runId} currency={currency} gameId={r.game_id} playerCrewMemberId={playerCrewMemberId} />}
        {tab === 'expenses' && <ExpensesPanel runId={runId} currency={currency} />}
        {tab === 'crew' && <CrewPanel runId={runId} currency={currency} profit={r.profit} playerCrewMemberId={playerCrewMemberId} />}
      </div>

      <DeleteRunModal runId={runId} runTitle={r.title || `Run #${r.id}`} open={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </div>
  );
}



