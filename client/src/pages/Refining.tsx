import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { miningApi, salesApi } from '@/lib/api';
import { MathInput } from '@/components/ui/MathInput';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Table, Th, Td, Tr } from '@/components/ui/Table';
import { fmtCurrency } from '@/lib/utils';
import {
  Plus, CheckCircle, Trash2, ChevronRight, DollarSign, Pencil, ExternalLink,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
type MatForm = {
  outputMaterial: string;
  refineryMethod: string;
  inputScu: string;
  outputScu: string;
  costToRefine: string;
};
const DEFAULT_MAT_FORM: MatForm = {
  outputMaterial: '', refineryMethod: '', inputScu: '', outputScu: '', costToRefine: '',
};

type StandaloneForm = {
  refineryName: string; outputMaterial: string; refineryMethod: string;
  inputScu: string; outputScu: string; costToRefine: string;
};
const DEFAULT_STANDALONE: StandaloneForm = {
  refineryName: '', outputMaterial: '', refineryMethod: '',
  inputScu: '', outputScu: '', costToRefine: '',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function qualityColor(q: number | null | undefined) {
  if (q == null) return 'text-slate-500';
  if (q >= 700) return 'text-emerald-400';
  if (q >= 400) return 'text-amber-400';
  return 'text-slate-400';
}

export function Refining() {
  const qc = useQueryClient();

  // ── Server data ─────────────────────────────────────────────────────────────
  const { data: committedBags = [] } = useQuery({
    queryKey: ['committed-bags'],
    queryFn: () => miningApi.getCommitted(),
  });
  const { data: allJobs = [] } = useQuery({
    queryKey: ['refining-all'],
    queryFn: () => miningApi.getAllRefining(),
  });

  const inv = () => {
    qc.invalidateQueries({ queryKey: ['refining-all'] });
    qc.invalidateQueries({ queryKey: ['committed-bags'] });
  };
  const invSale = () => { inv(); qc.invalidateQueries({ queryKey: ['inventory'] }); };

  // ── Mutations ────────────────────────────────────────────────────────────────
  const addJob    = useMutation({ mutationFn: (d: unknown) => miningApi.addRefining(d), onSuccess: inv });
  const editJob   = useMutation({ mutationFn: ({ id, d }: { id: number; d: unknown }) => miningApi.updateRefining(id, d), onSuccess: invSale });
  const removeJob = useMutation({ mutationFn: (id: number) => miningApi.removeRefining(id), onSuccess: inv });
  const addSale   = useMutation({ mutationFn: (d: unknown) => salesApi.create(d), onSuccess: invSale });
  const removeSale = useMutation({ mutationFn: (id: number) => salesApi.remove(id), onSuccess: invSale });

  // ── UI state ─────────────────────────────────────────────────────────────────
  // keyed by `${station}||${material}`
  const [matFormOpen, setMatFormOpen] = useState<Record<string, boolean>>({});
  const [matForm, setMatForm] = useState<Record<string, MatForm>>({});
  const setMF = (key: string, patch: Partial<MatForm>) =>
    setMatForm(f => ({ ...f, [key]: { ...(f[key] ?? DEFAULT_MAT_FORM), ...patch } }));

  // station collapse
  const [stationOpen, setStationOpen] = useState<Record<string, boolean>>({});

  const [showStandalone, setShowStandalone] = useState(false);
  const [standaloneForm, setStandaloneForm] = useState<StandaloneForm>(DEFAULT_STANDALONE);

  const [editingJob,  setEditingJob]  = useState<Record<number, any>>({});
  const [finishForm,  setFinishForm]  = useState<Record<number, { qty: string; eff: string }>>({});
  const [quickSale,   setQuickSale]   = useState<Record<number, { commodity: string; qty: string; price: string; location: string } | null>>({});

  // ── Derived: bags → station → material breakdown ──────────────────────────
  type MatEntry = { totalScu: number; lines: { scu: number; quality: number | null; bagLabel: string }[] };
  type StationEntry = { bags: any[]; materials: Record<string, MatEntry>; anchorBagId: number };

  const stationData: Record<string, StationEntry> = {};
  for (const bag of committedBags as any[]) {
    const loc = bag.committed_location || 'Unknown Station';
    if (!stationData[loc]) stationData[loc] = { bags: [], materials: {}, anchorBagId: bag.id };
    stationData[loc].bags.push(bag);
    for (const line of (bag.lines || []).filter((l: any) => !l.is_inert)) {
      const mat: string = line.material;
      if (!stationData[loc].materials[mat]) stationData[loc].materials[mat] = { totalScu: 0, lines: [] };
      stationData[loc].materials[mat].totalScu += Number(line.scu) || 0;
      stationData[loc].materials[mat].lines.push({ scu: Number(line.scu), quality: line.quality ?? null, bagLabel: bag.label });
    }
  }

  const jobs = allJobs as any[];
  const pendingJobs = jobs.filter(j => j.status !== 'done');
  const doneJobs    = jobs.filter(j => j.status === 'done');
  const currency    = jobs.find(j => j.currency)?.currency || 'UEC';
  const totalPending = pendingJobs.reduce((s, j) => s + (j.cost_to_refine || 0), 0);
  const totalEarned  = doneJobs.reduce((s, j) => s + (j.sale_revenue || 0), 0);

  // ── Job card renderer ────────────────────────────────────────────────────────
  const renderJob = (rj: any) => {
    const isSold    = (rj.sale_revenue ?? 0) > 0;
    const needsSale = rj.status === 'done' && !isSold;
    const qs        = quickSale[rj.id];
    const editing   = editingJob[rj.id];
    const jc        = rj.currency || currency;

    return (
      <div key={rj.id} className={`py-3 border-b border-slate-700/30 last:border-0 ${needsSale ? 'bg-amber-500/5' : ''}`}>
        {editing ? (
          <div className="px-1 space-y-2">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                ['Output material', 'output_material', 'input'],
                ['Station / refinery', 'refinery_name', 'input'],
                ['Method', 'refinery_method', 'input'],
              ].map(([label, field]) => (
                <div key={field}>
                  <p className="text-xs text-slate-500 mb-1">{label}</p>
                  <input value={editing[field] || ''} placeholder={label as string}
                    onChange={e => setEditingJob(f => ({ ...f, [rj.id]: { ...f[rj.id], [field]: e.target.value } }))} />
                </div>
              ))}
              {[
                ['Input SCU', 'input_quantity'],
                ['Output SCU', 'output_quantity'],
                ['Refining cost', 'cost_to_refine'],
              ].map(([label, field]) => (
                <div key={field}>
                  <p className="text-xs text-slate-500 mb-1">{label}</p>
                  <MathInput
                    value={editing[field] != null ? String(editing[field]) : ''}
                    placeholder={label as string}
                    onChange={e => setEditingJob(f => ({ ...f, [rj.id]: { ...f[rj.id], [field]: e.target.value } }))}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => {
                editJob.mutate({ id: rj.id, d: {
                  outputMaterial: editing.output_material,
                  refineryName:   editing.refinery_name   || undefined,
                  refineryMethod: editing.refinery_method || undefined,
                  inputQuantity:  Number(editing.input_quantity),
                  outputQuantity: editing.output_quantity !== '' && editing.output_quantity != null ? Number(editing.output_quantity) : undefined,
                  costToRefine:   Number(editing.cost_to_refine) || 0,
                }});
                setEditingJob(f => { const n = { ...f }; delete n[rj.id]; return n; });
              }}><CheckCircle size={12} /> Save</Button>
              <Button size="sm" variant="secondary"
                onClick={() => setEditingJob(f => { const n = { ...f }; delete n[rj.id]; return n; })}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_auto] gap-2 items-start">
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-slate-200 text-sm">{rj.output_material}</span>
                <Badge label={rj.status} />
                {rj.refinery_name && (
                  <span className="text-xs text-slate-500">
                    {rj.refinery_name}{rj.refinery_method ? ` · ${rj.refinery_method}` : ''}
                  </span>
                )}
                {rj.run_id && (
                  <Link to={`/runs/${rj.run_id}`} className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
                    {rj.run_title || `Run #${rj.run_id}`}<ExternalLink size={10} />
                  </Link>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                <span>In: <span className="text-slate-300">{rj.input_quantity} SCU</span></span>
                {rj.output_quantity != null
                  ? <span>Out: <span className="text-emerald-400">{rj.output_quantity} SCU</span></span>
                  : <span className="text-slate-600">Out: pending</span>}
                {rj.efficiency   != null && <span>Yield: {rj.efficiency}%</span>}
                {(rj.cost_to_refine || 0) > 0 && <span className="text-red-400">Cost: {fmtCurrency(rj.cost_to_refine, jc)}</span>}
                {isSold && <span className="text-emerald-400 font-medium">Sold: {fmtCurrency(rj.sale_revenue, jc)}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
              <Button size="sm" variant="secondary" onClick={() => setEditingJob(f => ({ ...f, [rj.id]: { ...rj } }))}>
                <Pencil size={11} />
              </Button>
              {rj.status !== 'done' && (
                <>
                  <MathInput placeholder="Out SCU" className="w-20"
                    value={finishForm[rj.id]?.qty || ''}
                    onChange={e => setFinishForm(f => ({ ...f, [rj.id]: { ...f[rj.id], qty: e.target.value } }))} />
                  <MathInput placeholder="Yield %" className="w-14"
                    value={finishForm[rj.id]?.eff || ''}
                    onChange={e => setFinishForm(f => ({ ...f, [rj.id]: { ...f[rj.id], eff: e.target.value } }))} />
                  <Button size="sm" variant="secondary" onClick={() => {
                    const ff = finishForm[rj.id];
                    if (!ff?.qty) return;
                    editJob.mutate({ id: rj.id, d: { outputQuantity: Number(ff.qty), efficiency: ff.eff ? Number(ff.eff) : undefined, status: 'done', completedAt: new Date().toISOString() } });
                    setFinishForm(f => { const n = { ...f }; delete n[rj.id]; return n; });
                  }}><CheckCircle size={12} /> Done</Button>
                </>
              )}
              {needsSale && (
                <Button size="sm" variant="secondary" onClick={() =>
                  setQuickSale(f => ({ ...f, [rj.id]: { commodity: rj.output_material || '', qty: String(rj.output_quantity ?? ''), price: '', location: '' } }))}>
                  <DollarSign size={12} /> Sell
                </Button>
              )}
              <Button variant="danger" size="sm" onClick={() => removeJob.mutate(rj.id)}><Trash2 size={12} /></Button>
            </div>
          </div>
        )}

        {/* Quick sale */}
        {qs && (
          <div className="mt-2 p-3 bg-slate-800/50 rounded-lg border border-slate-700/40 space-y-2">
            <p className="text-xs text-slate-400">Record sale for this refined ore</p>
            <div className="flex gap-2 flex-wrap items-end">
              <div className="flex-1 min-w-[130px]">
                <p className="text-xs text-slate-500 mb-1">Commodity</p>
                <input value={qs.commodity} placeholder="e.g. Quantanium"
                  onChange={e => setQuickSale(f => ({ ...f, [rj.id]: { ...f[rj.id]!, commodity: e.target.value } }))} />
              </div>
              <div className="w-24">
                <p className="text-xs text-slate-500 mb-1">Qty (SCU)</p>
                <MathInput value={qs.qty} placeholder="SCU"
                  onChange={e => setQuickSale(f => ({ ...f, [rj.id]: { ...f[rj.id]!, qty: e.target.value } }))} />
              </div>
              <div className="w-32">
                <p className="text-xs text-slate-500 mb-1">Price / unit</p>
                <MathInput value={qs.price} placeholder={jc}
                  onChange={e => setQuickSale(f => ({ ...f, [rj.id]: { ...f[rj.id]!, price: e.target.value } }))} />
              </div>
              <div className="w-36">
                <p className="text-xs text-slate-500 mb-1">Location (opt)</p>
                <input value={qs.location}
                  onChange={e => setQuickSale(f => ({ ...f, [rj.id]: { ...f[rj.id]!, location: e.target.value } }))} />
              </div>
              {qs.qty && qs.price && (
                <span className="text-sm text-emerald-400 font-semibold pb-0.5">
                  = {fmtCurrency(Number(qs.qty) * Number(qs.price), jc)}
                </span>
              )}
              <div className="flex gap-1.5 pb-0.5">
                <Button size="sm" onClick={() => {
                  if (!qs.commodity || !qs.qty || !qs.price) return;
                  addSale.mutate({ refiningJobId: rj.id, commodity: qs.commodity, quantitySold: Number(qs.qty), pricePerUnit: Number(qs.price), location: qs.location || undefined });
                  setQuickSale(f => ({ ...f, [rj.id]: null }));
                }}><CheckCircle size={12} /> Save</Button>
                <Button size="sm" variant="secondary" onClick={() => setQuickSale(f => ({ ...f, [rj.id]: null }))}>Cancel</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Page ──────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Refining</h1>
        <p className="text-sm text-slate-500 mt-0.5">Process mined ore into refined materials</p>
      </div>

      {/* Stats */}
      {jobs.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          <div className="rounded-xl border border-[#1e2d4f] bg-[#141c35] px-4 py-3">
            <p className="text-xs text-slate-500">Active jobs</p>
            <p className="text-xl font-bold text-blue-400">{pendingJobs.length}</p>
          </div>
          <div className="rounded-xl border border-[#1e2d4f] bg-[#141c35] px-4 py-3">
            <p className="text-xs text-slate-500">Total refining cost</p>
            <p className="text-xl font-bold text-red-400">{fmtCurrency(totalPending, currency)}</p>
          </div>
          <div className="rounded-xl border border-[#1e2d4f] bg-[#141c35] px-4 py-3">
            <p className="text-xs text-slate-500">Earned (sold)</p>
            <p className="text-xl font-bold text-emerald-400">{fmtCurrency(totalEarned, currency)}</p>
          </div>
        </div>
      )}

      {/* ── Queue from committed bags — grouped by station → material ── */}
      {Object.keys(stationData).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Queue Refining Job</CardTitle>
            <span className="text-xs text-slate-500">Ore checked in from mining runs</span>
          </CardHeader>

          <div className="divide-y divide-slate-700/40">
            {Object.entries(stationData).map(([station, sd]) => {
              const isStationOpen = stationOpen[station] ?? true;
              const totalStationScu = Object.values(sd.materials).reduce((s, m) => s + m.totalScu, 0);

              return (
                <div key={station} className="py-3 first:pt-0 last:pb-0">
                  {/* Station header */}
                  <button
                    onClick={() => setStationOpen(f => ({ ...f, [station]: !isStationOpen }))}
                    className="flex items-center gap-2 w-full text-left group"
                  >
                    <ChevronRight size={13} className={`shrink-0 text-slate-500 transition-transform duration-150 ${isStationOpen ? 'rotate-90' : ''}`} />
                    <span className="font-bold text-slate-100 text-sm">{station}</span>
                    <span className="text-xs text-slate-500">{sd.bags.length} bag{sd.bags.length !== 1 ? 's' : ''}</span>
                    <span className="text-xs text-orange-400 font-medium">{totalStationScu.toFixed(2)} SCU total</span>
                    <span className="text-xs text-slate-600">{Object.keys(sd.materials).join(' · ')}</span>
                  </button>

                  {isStationOpen && (
                    <div className="mt-3 ml-5 space-y-4">
                      {Object.entries(sd.materials).map(([material, matData]) => {
                        const formKey = `${station}||${material}`;
                        const isFormOpen = matFormOpen[formKey] ?? false;
                        const mf = matForm[formKey] ?? DEFAULT_MAT_FORM;

                        // Sort quality lines high→low for display
                        const sortedLines = [...matData.lines].sort((a, b) => (b.quality ?? 0) - (a.quality ?? 0));

                        return (
                          <div key={material} className="border border-slate-700/50 rounded-lg overflow-hidden">
                            {/* Material header row */}
                            <div className="flex items-center gap-3 px-3 py-2 bg-slate-800/40">
                              <div className="flex-1 min-w-0">
                                <span className="font-semibold text-slate-200 text-sm">{material}</span>
                                <span className="ml-2 text-xs text-orange-400 font-medium">{matData.totalScu.toFixed(2)} SCU</span>
                                <span className="ml-2 text-xs text-slate-500">{matData.lines.length} deposit{matData.lines.length !== 1 ? 's' : ''}</span>
                              </div>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setMatFormOpen(f => ({ ...f, [formKey]: !isFormOpen }));
                                  // Pre-fill input SCU with total
                                  if (!isFormOpen) {
                                    setMatForm(f => ({
                                      ...f,
                                      [formKey]: {
                                        ...(f[formKey] ?? DEFAULT_MAT_FORM),
                                        outputMaterial: material,
                                        inputScu: matData.totalScu.toFixed(2),
                                      },
                                    }));
                                  }
                                }}
                              >
                                {isFormOpen ? 'Cancel' : <><Plus size={11} /> Queue Job</>}
                              </Button>
                            </div>

                            {/* Quality breakdown table */}
                            <div className="px-3 pb-2 pt-1">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-slate-600 uppercase tracking-wider">
                                    <th className="text-left py-1 font-medium">Bag</th>
                                    <th className="text-right py-1 font-medium">Quality</th>
                                    <th className="text-right py-1 font-medium">SCU</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {sortedLines.map((line, i) => (
                                    <tr key={i} className="border-t border-slate-800">
                                      <td className="py-1 text-slate-500">{line.bagLabel}</td>
                                      <td className={`py-1 text-right font-mono ${qualityColor(line.quality)}`}>
                                        {line.quality != null ? line.quality : '—'}
                                      </td>
                                      <td className="py-1 text-right text-slate-300">{line.scu.toFixed(2)}</td>
                                    </tr>
                                  ))}
                                  {matData.lines.length > 1 && (
                                    <tr className="border-t border-slate-700">
                                      <td className="py-1 text-slate-600 font-medium">Total</td>
                                      <td />
                                      <td className="py-1 text-right text-orange-400 font-semibold">{matData.totalScu.toFixed(2)}</td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>

                            {/* Queue job form (inline, beneath quality table) */}
                            {isFormOpen && (
                              <div className="px-3 pb-3 pt-1 border-t border-slate-700/50 bg-slate-900/30">
                                <p className="text-xs text-slate-500 mb-2 font-medium">Refining job details</p>
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                  <div>
                                    <p className="text-xs text-slate-600 mb-0.5">Output material</p>
                                    <input value={mf.outputMaterial} placeholder={material}
                                      onChange={e => setMF(formKey, { outputMaterial: e.target.value })} />
                                  </div>
                                  <div>
                                    <p className="text-xs text-slate-600 mb-0.5">Method (e.g. Dinyx)</p>
                                    <input value={mf.refineryMethod} placeholder="Select method"
                                      onChange={e => setMF(formKey, { refineryMethod: e.target.value })} />
                                  </div>
                                  <div>
                                    <p className="text-xs text-slate-600 mb-0.5">Input SCU</p>
                                    <MathInput value={mf.inputScu} placeholder={matData.totalScu.toFixed(2)}
                                      onChange={e => setMF(formKey, { inputScu: e.target.value })} />
                                  </div>
                                  <div>
                                    <p className="text-xs text-slate-600 mb-0.5">Expected output SCU</p>
                                    <MathInput value={mf.outputScu} placeholder="—"
                                      onChange={e => setMF(formKey, { outputScu: e.target.value })} />
                                  </div>
                                  <div>
                                    <p className="text-xs text-slate-600 mb-0.5">Refining cost</p>
                                    <MathInput value={mf.costToRefine} placeholder="0"
                                      onChange={e => setMF(formKey, { costToRefine: e.target.value })} />
                                  </div>
                                  <div className="flex items-end">
                                    <Button
                                      size="sm"
                                      className="w-full"
                                      onClick={() => {
                                        const inputQty = mf.inputScu ? Number(mf.inputScu) : matData.totalScu;
                                        const outMat   = mf.outputMaterial || material;
                                        if (!outMat || !inputQty) return;
                                        addJob.mutate({
                                          bagId:          sd.anchorBagId,
                                          inputQuantity:  inputQty,
                                          outputMaterial: outMat,
                                          outputQuantity: mf.outputScu ? Number(mf.outputScu) : undefined,
                                          refineryName:   station,
                                          refineryMethod: mf.refineryMethod || undefined,
                                          costToRefine:   Number(mf.costToRefine) || 0,
                                        });
                                        setMatFormOpen(f => ({ ...f, [formKey]: false }));
                                        setMatForm(f => ({ ...f, [formKey]: DEFAULT_MAT_FORM }));
                                      }}
                                    >
                                      <Plus size={13} /> Queue
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── Standalone job ── */}
      <Card>
        <button
          className="flex items-center gap-2 w-full text-left"
          onClick={() => setShowStandalone(v => !v)}
        >
          <ChevronRight size={13} className={`text-slate-500 transition-transform duration-150 ${showStandalone ? 'rotate-90' : ''}`} />
          <CardTitle>Add Standalone Refining Job</CardTitle>
          <span className="text-xs text-slate-500 ml-1">not linked to a mining run</span>
        </button>
        {showStandalone && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div>
              <p className="text-xs text-slate-600 mb-0.5">Station / refinery *</p>
              <input value={standaloneForm.refineryName} placeholder="e.g. ARC-L1 Covalex"
                onChange={e => setStandaloneForm(f => ({ ...f, refineryName: e.target.value }))} />
            </div>
            <div>
              <p className="text-xs text-slate-600 mb-0.5">Output material *</p>
              <input value={standaloneForm.outputMaterial} placeholder="e.g. Quantanium"
                onChange={e => setStandaloneForm(f => ({ ...f, outputMaterial: e.target.value }))} />
            </div>
            <div>
              <p className="text-xs text-slate-600 mb-0.5">Method</p>
              <input value={standaloneForm.refineryMethod} placeholder="e.g. Dinyx Solventation"
                onChange={e => setStandaloneForm(f => ({ ...f, refineryMethod: e.target.value }))} />
            </div>
            <div>
              <p className="text-xs text-slate-600 mb-0.5">Input SCU *</p>
              <MathInput value={standaloneForm.inputScu}
                onChange={e => setStandaloneForm(f => ({ ...f, inputScu: e.target.value }))} />
            </div>
            <div>
              <p className="text-xs text-slate-600 mb-0.5">Expected output SCU</p>
              <MathInput value={standaloneForm.outputScu}
                onChange={e => setStandaloneForm(f => ({ ...f, outputScu: e.target.value }))} />
            </div>
            <div>
              <p className="text-xs text-slate-600 mb-0.5">Refining cost</p>
              <MathInput value={standaloneForm.costToRefine}
                onChange={e => setStandaloneForm(f => ({ ...f, costToRefine: e.target.value }))} />
            </div>
            <Button size="sm" className="col-span-2 sm:col-span-3" onClick={() => {
              if (!standaloneForm.outputMaterial || !standaloneForm.inputScu) return;
              addJob.mutate({
                refineryName:   standaloneForm.refineryName  || undefined,
                outputMaterial: standaloneForm.outputMaterial,
                inputQuantity:  Number(standaloneForm.inputScu),
                outputQuantity: standaloneForm.outputScu ? Number(standaloneForm.outputScu) : undefined,
                refineryMethod: standaloneForm.refineryMethod || undefined,
                costToRefine:   Number(standaloneForm.costToRefine) || 0,
              });
              setStandaloneForm(DEFAULT_STANDALONE);
              setShowStandalone(false);
            }}><Plus size={13} /> Add Job</Button>
          </div>
        )}
      </Card>

      {/* ── Active jobs ── */}
      {pendingJobs.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Active Jobs ({pendingJobs.length})</CardTitle></CardHeader>
          <div>{pendingJobs.map(renderJob)}</div>
        </Card>
      )}

      {/* ── Completed jobs ── */}
      {doneJobs.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Completed ({doneJobs.length})</CardTitle></CardHeader>
          <div className="opacity-80">{doneJobs.map(renderJob)}</div>
        </Card>
      )}

      {jobs.length === 0 && Object.keys(stationData).length === 0 && (
        <div className="text-center py-12">
          <p className="text-slate-400 font-medium">No refining activity yet</p>
          <p className="text-sm text-slate-600 mt-1">
            Check in mining bags from a run's Mining tab, or add a standalone job above.
          </p>
        </div>
      )}
    </div>
  );
}
