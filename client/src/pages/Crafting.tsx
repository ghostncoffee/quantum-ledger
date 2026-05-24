import { MathInput } from '@/components/ui/MathInput';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { craftingApi, gamesApi } from '@/lib/api';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Table, Th, Td, Tr } from '@/components/ui/Table';
import { fmtCurrency, profitColor } from '@/lib/utils';
import { Plus, Trash2, CheckCircle, ChevronRight } from 'lucide-react';

export function Crafting() {
  const qc = useQueryClient();
  const [gameFilter, setGameFilter] = useState('');
  const [jobForm, setJobForm] = useState({ gameId: '', outputItem: '', outputQuantity: '', estimatedValue: '' });
  const [inputForms, setInputForms] = useState<Record<number, { material: string; quantityRequired: string; costPerUnit: string }>>({});
  const [expandedJobs, setExpandedJobs] = useState<Record<number, boolean>>({});

  const { data: games = [] } = useQuery({ queryKey: ['games'], queryFn: gamesApi.list });
  const { data: jobs = [] } = useQuery({
    queryKey: ['crafting-jobs', gameFilter],
    queryFn: () => craftingApi.list(gameFilter ? { gameId: gameFilter } : undefined),
  });

  const inv = () => qc.invalidateQueries({ queryKey: ['crafting-jobs'] });

  const addJob = useMutation({
    mutationFn: (d: unknown) => craftingApi.createJob(d),
    onSuccess: inv,
  });
  const removeJob = useMutation({
    mutationFn: (id: number) => craftingApi.removeJob(id),
    onSuccess: inv,
  });
  const completeJob = useMutation({
    mutationFn: (id: number) => craftingApi.updateJob(id, { status: 'complete', completedAt: new Date().toISOString() }),
    onSuccess: inv,
  });
  const addInput = useMutation({
    mutationFn: ({ jobId, d }: { jobId: number; d: unknown }) => craftingApi.addInput(jobId, d),
    onSuccess: inv,
  });
  const removeInput = useMutation({
    mutationFn: (id: number) => craftingApi.removeInput(id),
    onSuccess: inv,
  });

  const getCurrency = (job: any) =>
    (games as any[]).find((g: any) => g.id === job.resolved_game_id)?.currency
    || job.currency
    || 'UEC';

  const inProgress = (jobs as any[]).filter((j: any) => j.status === 'in_progress');
  const completed  = (jobs as any[]).filter((j: any) => j.status === 'complete');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Crafting Workshop</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Track manufacturing jobs independently of any run
          </p>
        </div>
        <select className="w-40" value={gameFilter} onChange={e => setGameFilter(e.target.value)}>
          <option value="">All games</option>
          {(games as any[]).map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>

      {/* ── New job form ── */}
      <Card>
        <CardHeader><CardTitle>New Crafting Job</CardTitle></CardHeader>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <select
            value={jobForm.gameId}
            onChange={e => setJobForm(f => ({ ...f, gameId: e.target.value }))}
          >
            <option value="">Game *</option>
            {(games as any[]).map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <input
            placeholder="Output item *"
            value={jobForm.outputItem}
            onChange={e => setJobForm(f => ({ ...f, outputItem: e.target.value }))}
          />
          <MathInput
            placeholder="Output quantity *"
            value={jobForm.outputQuantity}
            onChange={e => setJobForm(f => ({ ...f, outputQuantity: e.target.value }))}
          />
          <MathInput
            placeholder="Est. sell value"
            value={jobForm.estimatedValue}
            onChange={e => setJobForm(f => ({ ...f, estimatedValue: e.target.value }))}
          />
        </div>
        <Button
          className="mt-2"
          size="sm"
          onClick={() => {
            if (!jobForm.gameId || !jobForm.outputItem || !jobForm.outputQuantity) return;
            addJob.mutate({
              gameId: Number(jobForm.gameId),
              outputItem: jobForm.outputItem,
              outputQuantity: Number(jobForm.outputQuantity),
              estimatedValue: jobForm.estimatedValue ? Number(jobForm.estimatedValue) : undefined,
            });
            setJobForm(f => ({ ...f, outputItem: '', outputQuantity: '', estimatedValue: '' }));
          }}
        >
          <Plus size={13} /> Create Job
        </Button>
      </Card>

      {/* ── In-progress jobs ── */}
      {inProgress.length === 0 && completed.length === 0 && (
        <p className="text-sm text-slate-500">No crafting jobs yet — create one above.</p>
      )}

      {inProgress.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">In Progress</h2>
          {inProgress.map((job: any) => {
            const currency = getCurrency(job);
            const totalInputCost = job.total_input_cost ?? 0;
            const margin = job.estimated_value != null ? job.estimated_value - totalInputCost : null;
            const inf = inputForms[job.id] || { material: '', quantityRequired: '', costPerUnit: '' };
            const expanded = expandedJobs[job.id] ?? true;

            return (
              <Card key={job.id}>
                {/* Job header */}
                <div className="flex items-start justify-between mb-2">
                  <button
                    className="flex items-center gap-1.5 text-left min-w-0"
                    onClick={() => setExpandedJobs(f => ({ ...f, [job.id]: !expanded }))}
                  >
                    <ChevronRight
                      size={13}
                      className={`shrink-0 text-slate-500 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
                    />
                    <div className="min-w-0">
                      <span className="font-semibold text-slate-200">{job.output_item}</span>
                      <span className="ml-2 text-sm text-slate-400">× {job.output_quantity}</span>
                      {job.game_name && (
                        <span className="ml-2 text-xs text-slate-500">{job.game_name}</span>
                      )}
                    </div>
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge label={job.status} />
                    <Button size="sm" variant="secondary" onClick={() => completeJob.mutate(job.id)}>
                      <CheckCircle size={12} /> Complete
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => removeJob.mutate(job.id)}>
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </div>

                {expanded && (
                  <>
                    {/* Summary row */}
                    <div className="grid grid-cols-3 gap-3 text-sm mb-3">
                      <div>
                        <p className="text-xs text-slate-500">Input cost</p>
                        <p className="text-red-400">{fmtCurrency(totalInputCost, currency)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Est. value</p>
                        <p className="text-slate-200">
                          {job.estimated_value != null ? fmtCurrency(job.estimated_value, currency) : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Est. margin</p>
                        <p className={margin != null ? profitColor(margin) : 'text-slate-500'}>
                          {margin != null ? fmtCurrency(margin, currency) : '—'}
                        </p>
                      </div>
                    </div>

                    {/* Inputs table */}
                    {(job.inputs || []).length > 0 && (
                      <Table>
                        <thead>
                          <tr>
                            <Th>Material</Th>
                            <Th>Qty req.</Th>
                            <Th>Cost/unit</Th>
                            <Th>Total</Th>
                            <Th />
                          </tr>
                        </thead>
                        <tbody>
                          {(job.inputs as any[]).map((inp: any) => (
                            <Tr key={inp.id}>
                              <Td>{inp.material}</Td>
                              <Td>{inp.quantity_required}</Td>
                              <Td className="text-slate-400">
                                {inp.cost_per_unit != null ? fmtCurrency(inp.cost_per_unit, currency) : '—'}
                              </Td>
                              <Td className="text-red-400">
                                {inp.total_cost != null ? fmtCurrency(inp.total_cost, currency) : '—'}
                              </Td>
                              <Td>
                                <Button variant="danger" size="sm" onClick={() => removeInput.mutate(inp.id)}>
                                  <Trash2 size={12} />
                                </Button>
                              </Td>
                            </Tr>
                          ))}
                        </tbody>
                      </Table>
                    )}

                    {/* Add input row */}
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <input
                        placeholder="Material"
                        className="flex-1 min-w-[120px]"
                        value={inf.material}
                        onChange={ev => setInputForms(f => ({ ...f, [job.id]: { ...f[job.id], material: ev.target.value } }))}
                      />
                      <MathInput
                        placeholder="Qty"
                        className="w-20"
                        value={inf.quantityRequired}
                        onChange={ev => setInputForms(f => ({ ...f, [job.id]: { ...f[job.id], quantityRequired: ev.target.value } }))}
                      />
                      <MathInput
                        placeholder="Cost/unit"
                        className="w-24"
                        value={inf.costPerUnit}
                        onChange={ev => setInputForms(f => ({ ...f, [job.id]: { ...f[job.id], costPerUnit: ev.target.value } }))}
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          if (!inf.material || !inf.quantityRequired) return;
                          addInput.mutate({
                            jobId: job.id,
                            d: {
                              material: inf.material,
                              quantityRequired: Number(inf.quantityRequired),
                              costPerUnit: inf.costPerUnit ? Number(inf.costPerUnit) : undefined,
                            },
                          });
                          setInputForms(f => ({ ...f, [job.id]: { material: '', quantityRequired: '', costPerUnit: '' } }));
                        }}
                      >
                        <Plus size={12} /> Add Input
                      </Button>
                    </div>
                  </>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Completed jobs ── */}
      {completed.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
            Completed ({completed.length})
          </h2>
          <Card className="p-0">
            <Table>
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th>Game</Th>
                  <Th>Qty</Th>
                  <Th>Input cost</Th>
                  <Th>Est. value</Th>
                  <Th>Margin</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {completed.map((job: any) => {
                  const currency = getCurrency(job);
                  const totalInputCost = job.total_input_cost ?? 0;
                  const margin = job.estimated_value != null ? job.estimated_value - totalInputCost : null;
                  return (
                    <Tr key={job.id} className="opacity-70">
                      <Td className="font-medium text-slate-300">{job.output_item}</Td>
                      <Td className="text-slate-500">{job.game_name || '—'}</Td>
                      <Td>{job.output_quantity}</Td>
                      <Td className="text-red-400">{fmtCurrency(totalInputCost, currency)}</Td>
                      <Td>{job.estimated_value != null ? fmtCurrency(job.estimated_value, currency) : '—'}</Td>
                      <Td className={margin != null ? profitColor(margin) : 'text-slate-500'}>
                        {margin != null ? fmtCurrency(margin, currency) : '—'}
                      </Td>
                      <Td>
                        <Button variant="danger" size="sm" onClick={() => removeJob.mutate(job.id)}>
                          <Trash2 size={12} />
                        </Button>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </Card>
        </div>
      )}
    </div>
  );
}
