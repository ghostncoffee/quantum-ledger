import { MathInput } from '@/components/ui/MathInput';
import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { crewApi, runsApi, contractsApi } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { fmtCurrency, fmtDatetime } from '@/lib/utils';
import { ChevronLeft, ChevronRight, CheckCircle, Star, ExternalLink } from 'lucide-react';

export function CrewDetail() {
  const { id } = useParams<{ id: string }>();
  const crewId = Number(id);
  const qc = useQueryClient();
  const [showSettled, setShowSettled] = useState(false);
  // editAmounts: keyed by `run-{rowId}` or `contract-{rowId}`
  const [editAmounts, setEditAmounts] = useState<Record<string, string>>({});

  const { data: member } = useQuery({
    queryKey: ['crew-member', crewId],
    queryFn: () => crewApi.get(crewId),
  });

  const { data: history, isLoading } = useQuery({
    queryKey: ['crew-history', crewId],
    queryFn: () => crewApi.getHistory(crewId),
  });

  const settleRun = useMutation({
    mutationFn: ({ runId, rowId, amount }: { runId: number; rowId: number; amount: number }) =>
      runsApi.updateCrew(runId, rowId, { payoutSettled: true, actualPayout: amount }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crew-history', crewId] });
      qc.invalidateQueries({ queryKey: ['runs'] });
    },
  });

  const settleContract = useMutation({
    mutationFn: ({ contractId, rowId, amount }: { contractId: number; rowId: number; amount: number }) =>
      contractsApi.updateCrew(contractId, rowId, { payoutSettled: true, actualPayout: amount }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crew-history', crewId] });
    },
  });

  if (isLoading || !member) return <div className="text-slate-500 p-8">Loading…</div>;

  const m = member as any;
  const h = history as any;
  const { runCrew = [], contractCrew = [], summary = {} } = h || {};

  // Helper: resolve current amount for a row (edited value or calculated fallback)
  const getAmount = (key: string, fallback: number): number => {
    const v = editAmounts[key];
    return v !== undefined ? Number(v) : fallback;
  };
  const getAmountStr = (key: string, fallback: number): string => {
    return editAmounts[key] !== undefined ? editAmounts[key] : String(fallback ?? 0);
  };

  // Collect all unique run IDs
  const allRunIds = [
    ...new Set([
      ...(runCrew as any[]).map((r: any) => r.run_id as number),
      ...(contractCrew as any[]).map((c: any) => c.run_id as number),
    ]),
  ];

  // Get representative info for a run from whichever array has it
  const runInfo = (runId: number): any =>
    (runCrew as any[]).find((r: any) => r.run_id === runId) ||
    (contractCrew as any[]).find((c: any) => c.run_id === runId);

  const runHasUnsettled = (runId: number): boolean => {
    const unsettledRunEntry = (runCrew as any[]).some(
      (r: any) => r.run_id === runId && !r.payout_settled,
    );
    // Shared contract entries don't need manual settling — game auto-pays
    const unsettledContractEntry = (contractCrew as any[]).some(
      (c: any) => c.run_id === runId && !c.payout_settled && !c.is_shared,
    );
    return unsettledRunEntry || unsettledContractEntry;
  };

  // Sort: unsettled runs first, then by date desc
  const sortedRunIds = [...allRunIds].sort((a, b) => {
    const aUnsettled = runHasUnsettled(a);
    const bUnsettled = runHasUnsettled(b);
    if (aUnsettled && !bUnsettled) return -1;
    if (!aUnsettled && bUnsettled) return 1;
    const dateA = runInfo(a)?.started_at ?? '';
    const dateB = runInfo(b)?.started_at ?? '';
    return dateB.localeCompare(dateA);
  });

  const settledRunCount = allRunIds.filter(id => !runHasUnsettled(id)).length;

  // Settle all outstanding
  const settleAll = () => {
    const runPromises = (runCrew as any[])
      .filter((r: any) => !r.payout_settled)
      .map((r: any) =>
        settleRun.mutateAsync({
          runId: r.run_id,
          rowId: r.id,
          amount: getAmount(`run-${r.id}`, r.calculated_payout ?? 0),
        }),
      );
    const contractPromises = (contractCrew as any[])
      .filter((c: any) => !c.payout_settled && c.contract_status === 'complete' && !c.is_shared)
      .map((c: any) =>
        settleContract.mutateAsync({
          contractId: c.contract_id,
          rowId: c.id,
          amount: getAmount(`contract-${c.id}`, c.calculated_payout ?? 0),
        }),
      );
    Promise.all([...runPromises, ...contractPromises]);
  };

  const totalUnsettled =
    (runCrew as any[]).filter((r: any) => !r.payout_settled).length +
    (contractCrew as any[]).filter((c: any) => !c.payout_settled && !c.is_shared).length;

  const isBusy = settleRun.isPending || settleContract.isPending;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <Link to="/crew" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-300 mb-2">
          <ChevronLeft size={14} /> All Crew
        </Link>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-slate-100">{m.name}</h1>
          {m.is_player ? (
            <span className="inline-flex items-center gap-1 text-sm px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium">
              <Star size={12} className="fill-amber-400" /> You
            </span>
          ) : null}
          {m.game_handle && <span className="text-slate-500 text-sm">{m.game_handle}</span>}
        </div>
        {m.game_name && <p className="text-sm text-slate-500 mt-0.5">{m.game_name}</p>}
        {m.notes && <p className="text-sm text-slate-600 mt-0.5 italic">{m.notes}</p>}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Outstanding"
          value={fmtCurrency(summary.totalOutstanding ?? 0, 'UEC')}
          trend={summary.totalOutstanding > 0 ? 'down' : undefined}
        />
        <StatCard
          label="Total Paid Out"
          value={fmtCurrency(summary.totalSettled ?? 0, 'UEC')}
          trend={summary.totalSettled > 0 ? 'up' : undefined}
        />
        <StatCard label="Runs" value={String(summary.runsCount ?? 0)} />
        <StatCard label="Contracts" value={String(summary.contractsCount ?? 0)} />
      </div>

      {/* Settle all bar */}
      {totalUnsettled > 0 && (
        <div className="flex items-center justify-between bg-amber-900/10 border border-amber-500/20 rounded-lg px-4 py-2.5">
          <p className="text-sm text-amber-400">
            {totalUnsettled} unsettled payout{totalUnsettled !== 1 ? 's' : ''} pending
          </p>
          <Button size="sm" variant="secondary" onClick={settleAll} disabled={isBusy}>
            <CheckCircle size={13} /> Settle All Outstanding
          </Button>
        </div>
      )}

      {/* No history */}
      {allRunIds.length === 0 && (
        <p className="text-slate-500 text-sm py-4">No run or contract history yet.</p>
      )}

      {/* Runs grouped */}
      <div className="space-y-4">
        {sortedRunIds.map(runId => {
          const info = runInfo(runId);
          const runEntries = (runCrew as any[]).filter((r: any) => r.run_id === runId);
          const contractEntries = (contractCrew as any[]).filter((c: any) => c.run_id === runId);
          const hasUnsettled = runHasUnsettled(runId);

          // Hide fully-settled runs unless user has toggled them on
          if (!hasUnsettled && !showSettled) return null;

          return (
            <Card key={runId} className={!hasUnsettled ? 'opacity-60' : ''}>
              {/* Run header */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <Link
                    to={`/runs/${runId}`}
                    className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 font-medium transition-colors"
                  >
                    {info?.run_title || `Run #${runId}`}
                    <ExternalLink size={12} />
                  </Link>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {info?.run_type && <Badge label={info.run_type} />}
                    {info?.run_status && <Badge label={info.run_status} />}
                    {info?.started_at && (
                      <span className="text-xs text-slate-500">{fmtDatetime(info.started_at)}</span>
                    )}
                  </div>
                </div>
                {hasUnsettled && (
                  <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded shrink-0">
                    unsettled
                  </span>
                )}
              </div>

              <div className="space-y-2">
                {/* ── Run crew entry ── */}
                {runEntries.map((rc: any) => {
                  const key = `run-${rc.id}`;
                  const amtStr = getAmountStr(key, rc.calculated_payout ?? 0);
                  return (
                    <div
                      key={rc.id}
                      className={`rounded-lg px-3 py-2.5 ${rc.payout_settled ? 'bg-[#0a0f1e]' : 'bg-[#0f1629]'}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap text-xs">
                            <span className="font-semibold text-slate-400 uppercase tracking-wide">
                              Run payout
                            </span>
                            {rc.role && (
                              <span className="text-slate-500">· {rc.role}</span>
                            )}
                            <span className="text-slate-600">
                              {rc.payout_type === 'percentage'
                                ? `${rc.payout_value}% of profit`
                                : fmtCurrency(rc.payout_value, rc.currency)}
                            </span>
                            {rc.run_status === 'active' && (
                              <span className="text-slate-500 italic">est.</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {rc.payout_settled ? (
                            <span className="text-emerald-400 text-sm font-semibold">
                              ✓ {fmtCurrency(rc.actual_payout, rc.currency)}
                            </span>
                          ) : (
                            <>
                              <MathInput
                                className="w-28 text-xs text-right"
                                value={amtStr}
                                onChange={e =>
                                  setEditAmounts(prev => ({ ...prev, [key]: e.target.value }))
                                }
                              />
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                  settleRun.mutate({
                                    runId: rc.run_id,
                                    rowId: rc.id,
                                    amount: Number(amtStr),
                                  })
                                }
                                disabled={isBusy}
                              >
                                <CheckCircle size={12} /> Settle
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* ── Contract crew entries ── */}
                {contractEntries.map((cc: any) => {
                  const key = `contract-${cc.id}`;
                  const amtStr = getAmountStr(key, cc.calculated_payout ?? 0);
                  const isShared = !!cc.is_shared;
                  const canSettle = !cc.payout_settled && cc.contract_status === 'complete' && !isShared;
                  return (
                    <div
                      key={cc.id}
                      className={`rounded-lg px-3 py-2.5 ${cc.payout_settled || isShared ? 'bg-[#0a0f1e]' : 'bg-[#0f1629]'}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap text-xs">
                            <span className="font-semibold text-slate-400 uppercase tracking-wide">
                              Contract
                            </span>
                            {cc.client_name && (
                              <span className="text-slate-300">{cc.client_name}</span>
                            )}
                            {cc.contract_type && <Badge label={cc.contract_type} />}
                            {isShared ? (
                              <span className="text-blue-400">
                                shared · {cc.shared_player_count} players · {fmtCurrency(cc.calculated_payout ?? 0, cc.currency)} each
                              </span>
                            ) : (
                              <span className="text-slate-600">
                                {cc.payout_type === 'percentage'
                                  ? `${cc.payout_value}% of ${fmtCurrency(cc.contract_total ?? 0, cc.currency)}`
                                  : fmtCurrency(cc.payout_value, cc.currency)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge label={cc.contract_status} />
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {cc.payout_settled ? (
                            <span className="text-emerald-400 text-sm font-semibold">
                              ✓ {fmtCurrency(cc.actual_payout, cc.currency)}
                            </span>
                          ) : isShared ? (
                            <span className="text-xs text-slate-500">game auto-pays</span>
                          ) : canSettle ? (
                            <>
                              <MathInput
                                className="w-28 text-xs text-right"
                                value={amtStr}
                                onChange={e =>
                                  setEditAmounts(prev => ({ ...prev, [key]: e.target.value }))
                                }
                              />
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                  settleContract.mutate({
                                    contractId: cc.contract_id,
                                    rowId: cc.id,
                                    amount: Number(amtStr),
                                  })
                                }
                                disabled={isBusy}
                              >
                                <CheckCircle size={12} /> Settle
                              </Button>
                            </>
                          ) : (
                            <span className="text-xs text-slate-500">
                              {fmtCurrency(cc.calculated_payout ?? 0, cc.currency)} · {cc.contract_status}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Toggle settled runs */}
      {settledRunCount > 0 && (
        <button
          onClick={() => setShowSettled(v => !v)}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          <ChevronRight
            size={11}
            className={`transition-transform duration-150 ${showSettled ? 'rotate-90' : ''}`}
          />
          {showSettled
            ? `Hide ${settledRunCount} settled run${settledRunCount !== 1 ? 's' : ''}`
            : `Show ${settledRunCount} settled run${settledRunCount !== 1 ? 's' : ''}`}
        </button>
      )}
    </div>
  );
}


