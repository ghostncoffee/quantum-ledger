import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { contractsApi, gamesApi } from '@/lib/api';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Table, Th, Td, Tr } from '@/components/ui/Table';
import { fmtCurrency } from '@/lib/utils';
import { CheckCircle, ExternalLink } from 'lucide-react';
import { CONTRACT_TYPES } from '@/lib/utils';

export function Contracts() {
  const qc = useQueryClient();
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data: contracts = [] } = useQuery({
    queryKey: ['contracts-all', typeFilter, statusFilter],
    queryFn: () => contractsApi.list(Object.fromEntries(Object.entries({ type: typeFilter, status: statusFilter }).filter(([, v]) => v))),
  });

  const complete = useMutation({
    mutationFn: (id: number) => contractsApi.complete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contracts-all'] }),
  });

  const totalActive = (contracts as any[]).filter((c: any) => c.status === 'active').reduce((s: number, c: any) => s + c.agreed_payout, 0);
  const totalEarned = (contracts as any[]).filter((c: any) => c.status === 'complete').reduce((s: number, c: any) => s + c.agreed_payout + c.bonus_payout, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Contracts</h1>
        <p className="text-sm text-slate-500 mt-0.5">All missions across all runs</p>
      </div>

      <div className="flex gap-3">
        <div className="rounded-xl border border-[#1e2d4f] bg-[#141c35] px-4 py-3">
          <p className="text-xs text-slate-500">Active contracts</p>
          <p className="text-xl font-bold text-blue-400">{fmtCurrency(totalActive)}</p>
        </div>
        <div className="rounded-xl border border-[#1e2d4f] bg-[#141c35] px-4 py-3">
          <p className="text-xs text-slate-500">Earned (completed)</p>
          <p className="text-xl font-bold text-emerald-400">{fmtCurrency(totalEarned)}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <select className="w-40" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          {CONTRACT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="w-40" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="complete">Complete</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <Card className="p-0">
        <Table>
          <thead>
            <tr>
              <Th>Type</Th><Th>Client</Th><Th>Description</Th><Th>Payout</Th><Th>Bonus</Th><Th>Status</Th><Th>Run</Th><Th />
            </tr>
          </thead>
          <tbody>
            {(contracts as any[]).length === 0 ? (
              <Tr><Td colSpan={8} className="text-center text-slate-500">No contracts found. Create a Contract-type run and add contracts within it.</Td></Tr>
            ) : (
              (contracts as any[]).map((c: any) => (
                <Tr key={c.id}>
                  <Td><Badge label={c.type} /></Td>
                  <Td className="text-slate-300">{c.client_name || '—'}</Td>
                  <Td className="text-slate-400 text-xs max-w-48 truncate">{c.description || '—'}</Td>
                  <Td className="text-emerald-400">{fmtCurrency(c.agreed_payout, c.currency)}</Td>
                  <Td className="text-amber-400">{c.bonus_payout ? fmtCurrency(c.bonus_payout, c.currency) : '—'}</Td>
                  <Td><Badge label={c.status} /></Td>
                  <Td>
                    {c.run_id ? (
                      <Link to={`/runs/${c.run_id}`} className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
                        {c.run_title || `Run #${c.run_id}`}
                        <ExternalLink size={10} />
                      </Link>
                    ) : '—'}
                  </Td>
                  <Td>
                    {c.status === 'active' && (
                      <Button size="sm" variant="secondary" onClick={() => complete.mutate(c.id)}>
                        <CheckCircle size={12} /> Done
                      </Button>
                    )}
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
