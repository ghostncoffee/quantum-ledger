import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { locationsApi, gamesApi } from '@/lib/api';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Table, Th, Td, Tr } from '@/components/ui/Table';
import { fmtCurrency, fmt } from '@/lib/utils';
import {
  MapPin, Package, Flame, Truck, TrendingUp, Activity,
  ChevronDown, ChevronRight, ExternalLink, Pickaxe,
} from 'lucide-react';

// ─── Section toggle hook ──────────────────────────────────────────────────────
function useExpanded(defaultOpen = true) {
  const [open, setOpen] = useState(defaultOpen);
  return { open, toggle: () => setOpen(v => !v) };
}

// ─── Stat chip ────────────────────────────────────────────────────────────────
function Chip({ icon: Icon, label, color = 'text-slate-400' }: {
  icon: React.ElementType;
  label: string;
  color?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${color}`}>
      <Icon size={11} />
      {label}
    </span>
  );
}

// ─── Collapsible section ──────────────────────────────────────────────────────
function Section({ title, icon: Icon, iconColor, count, children }: {
  title: string;
  icon: React.ElementType;
  iconColor: string;
  count: number;
  children: React.ReactNode;
}) {
  const { open, toggle } = useExpanded(true);
  if (count === 0) return null;
  return (
    <div className="border-t border-[#1e2d4f] pt-3 mt-3">
      <button
        onClick={toggle}
        className="flex items-center gap-2 w-full text-left mb-2 group"
      >
        <Icon size={13} className={iconColor} />
        <span className="text-xs font-semibold text-slate-300 flex-1">{title}</span>
        {open
          ? <ChevronDown size={12} className="text-slate-600 group-hover:text-slate-400" />
          : <ChevronRight size={12} className="text-slate-600 group-hover:text-slate-400" />
        }
      </button>
      {open && children}
    </div>
  );
}

// ─── Location card ────────────────────────────────────────────────────────────
function LocationCard({ loc, currency }: { loc: any; currency: string }) {
  const totalAssets =
    loc.inventoryCount +
    loc.refiningJobsCount +
    (loc.committedBagsCount || 0) +
    loc.haulingPickups.length +
    loc.haulingDeliveries.length +
    loc.tradingCargo.length;

  return (
    <Card>
      {/* Card header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-blue-600/20 border border-blue-700/40 flex items-center justify-center shrink-0">
            <MapPin size={14} className="text-blue-400" />
          </div>
          <div>
            <h3 className="font-bold text-slate-100 text-base leading-tight">{loc.name}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{totalAssets} asset{totalAssets !== 1 ? 's' : ''} tracked</p>
          </div>
        </div>
        {/* Quick stat chips */}
        <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 max-w-[200px]">
          {loc.inventoryCount > 0 && (
            <Chip icon={Package} label={`${loc.inventoryCount} item${loc.inventoryCount !== 1 ? 's' : ''}`} color="text-emerald-400" />
          )}
          {(loc.committedBagsCount || 0) > 0 && (
            <Chip icon={Pickaxe} label={`${loc.committedBagsCount} bag${loc.committedBagsCount !== 1 ? 's' : ''} · ${(loc.committedOreScu || 0).toFixed(1)} SCU`} color="text-orange-400" />
          )}
          {loc.refiningJobsCount > 0 && (
            <Chip icon={Flame} label={`${loc.refiningJobsCount} refining`} color="text-amber-400" />
          )}
          {(loc.haulingPickups.length + loc.haulingDeliveries.length) > 0 && (
            <Chip
              icon={Truck}
              label={`${loc.haulingPickups.length + loc.haulingDeliveries.length} hauling`}
              color="text-sky-400"
            />
          )}
          {loc.tradingCargo.length > 0 && (
            <Chip icon={TrendingUp} label={`${loc.tradingCargo.length} cargo`} color="text-violet-400" />
          )}
          {loc.activeRuns.length > 0 && (
            <Chip icon={Activity} label={`${loc.activeRuns.length} run${loc.activeRuns.length !== 1 ? 's' : ''}`} color="text-slate-400" />
          )}
        </div>
      </div>

      {/* ── Inventory ── */}
      <Section
        title={`Inventory · ${fmt(loc.inventoryQty)} qty${loc.inventoryValue > 0 ? ` · Est. ${fmtCurrency(loc.inventoryValue, currency)}` : ''}`}
        icon={Package}
        iconColor="text-emerald-400"
        count={loc.inventoryCount}
      >
        <Table>
          <thead>
            <tr>
              <Th>Item</Th>
              <Th>Quantity</Th>
              <Th>Unit cost</Th>
              <Th>Value</Th>
            </tr>
          </thead>
          <tbody>
            {loc.inventory.map((i: any) => (
              <Tr key={i.id}>
                <Td className="font-medium text-slate-200">{i.item}</Td>
                <Td className="text-slate-300">{fmt(i.quantity)}</Td>
                <Td className="text-slate-500">{i.unit_cost ? fmtCurrency(i.unit_cost, i.currency) : '—'}</Td>
                <Td className="text-emerald-400">
                  {i.unit_cost ? fmtCurrency(i.quantity * i.unit_cost, i.currency) : '—'}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Section>

      {/* ── Committed raw ore (mining bags checked in) ── */}
      <Section
        title={`Raw Ore at Station · ${loc.committedBagsCount} bag${loc.committedBagsCount !== 1 ? 's' : ''} · ${(loc.committedOreScu || 0).toFixed(2)} SCU ore`}
        icon={Pickaxe}
        iconColor="text-orange-400"
        count={loc.committedBagsCount || 0}
      >
        <Table>
          <thead>
            <tr>
              <Th>Bag</Th>
              <Th>Ore SCU</Th>
              <Th>Run</Th>
              <Th>Checked in</Th>
            </tr>
          </thead>
          <tbody>
            {(loc.committedBags || []).map((b: any) => (
              <Tr key={b.id}>
                <Td className="font-medium text-slate-200">{b.label}</Td>
                <Td className="text-orange-300">{(b.ore_scu || 0).toFixed(2)} SCU</Td>
                <Td>
                  {b.run_id && (
                    <Link
                      to={`/runs/${b.run_id}`}
                      className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                    >
                      {b.run_title || `Run #${b.run_id}`}
                      <ExternalLink size={10} />
                    </Link>
                  )}
                </Td>
                <Td className="text-slate-500 text-xs">{b.committed_at ? new Date(b.committed_at).toLocaleDateString() : '—'}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Section>

      {/* ── Refinery jobs ── */}
      <Section
        title={`Refinery · ${loc.refiningJobsCount} active job${loc.refiningJobsCount !== 1 ? 's' : ''} · ${fmt(loc.refiningScuIn)} SCU in`}
        icon={Flame}
        iconColor="text-amber-400"
        count={loc.refiningJobsCount}
      >
        <Table>
          <thead>
            <tr>
              <Th>Output material</Th>
              <Th>In (SCU)</Th>
              <Th>Out (SCU)</Th>
              <Th>Method</Th>
              <Th>Status</Th>
              <Th>Run</Th>
            </tr>
          </thead>
          <tbody>
            {loc.refiningJobs.map((j: any) => (
              <Tr key={j.id}>
                <Td className="font-medium text-slate-200">{j.output_material}</Td>
                <Td className="text-slate-300">{fmt(j.input_quantity)}</Td>
                <Td className="text-slate-400">{j.output_quantity != null ? fmt(j.output_quantity) : '—'}</Td>
                <Td className="text-slate-500">{j.refinery_method || '—'}</Td>
                <Td><Badge label={j.status} /></Td>
                <Td>
                  {j.run_id && (
                    <Link
                      to={`/runs/${j.run_id}`}
                      className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                    >
                      {j.run_title || `Run #${j.run_id}`}
                      <ExternalLink size={10} />
                    </Link>
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Section>

      {/* ── Hauling pickups ── */}
      <Section
        title={`Hauling pickup${loc.haulingPickups.length !== 1 ? 's' : ''} · ${loc.haulingPickups.length} contract${loc.haulingPickups.length !== 1 ? 's' : ''} waiting here`}
        icon={Truck}
        iconColor="text-sky-400"
        count={loc.haulingPickups.length}
      >
        <Table>
          <thead>
            <tr>
              <Th>Cargo</Th>
              <Th>SCU</Th>
              <Th>Deliver to</Th>
              <Th>Payout</Th>
              <Th>Run</Th>
            </tr>
          </thead>
          <tbody>
            {loc.haulingPickups.map((j: any) => (
              <Tr key={j.id}>
                <Td className="font-medium text-slate-200">{j.cargo_type || '—'}</Td>
                <Td className="text-slate-300">{j.scu_amount != null ? fmt(j.scu_amount) : '—'}</Td>
                <Td className="text-slate-400">{j.delivery_location || '—'}</Td>
                <Td className="text-emerald-400">{fmtCurrency(j.agreed_payout, j.currency)}</Td>
                <Td>
                  {j.run_id && (
                    <Link
                      to={`/runs/${j.run_id}`}
                      className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                    >
                      {j.run_title || `Run #${j.run_id}`}
                      <ExternalLink size={10} />
                    </Link>
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Section>

      {/* ── Hauling deliveries inbound ── */}
      <Section
        title={`Inbound deliveries · ${loc.haulingDeliveries.length} cargo en route here`}
        icon={Truck}
        iconColor="text-sky-300"
        count={loc.haulingDeliveries.length}
      >
        <Table>
          <thead>
            <tr>
              <Th>Cargo</Th>
              <Th>SCU</Th>
              <Th>From</Th>
              <Th>Payout</Th>
              <Th>Run</Th>
            </tr>
          </thead>
          <tbody>
            {loc.haulingDeliveries.map((j: any) => (
              <Tr key={j.id}>
                <Td className="font-medium text-slate-200">{j.cargo_type || '—'}</Td>
                <Td className="text-slate-300">{j.scu_amount != null ? fmt(j.scu_amount) : '—'}</Td>
                <Td className="text-slate-400">{j.pickup_location || '—'}</Td>
                <Td className="text-emerald-400">{fmtCurrency(j.agreed_payout, j.currency)}</Td>
                <Td>
                  {j.run_id && (
                    <Link
                      to={`/runs/${j.run_id}`}
                      className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                    >
                      {j.run_title || `Run #${j.run_id}`}
                      <ExternalLink size={10} />
                    </Link>
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Section>

      {/* ── Trading cargo ── */}
      <Section
        title={`Trading cargo · ${loc.tradingCargo.length} commodity batch${loc.tradingCargo.length !== 1 ? 'es' : ''} stored here`}
        icon={TrendingUp}
        iconColor="text-violet-400"
        count={loc.tradingCargo.length}
      >
        <Table>
          <thead>
            <tr>
              <Th>Commodity</Th>
              <Th>Qty bought</Th>
              <Th>Buy price</Th>
              <Th>Total cost</Th>
              <Th>Planned destination</Th>
            </tr>
          </thead>
          <tbody>
            {loc.tradingCargo.map((t: any) => (
              <Tr key={t.id}>
                <Td className="font-medium text-slate-200">{t.commodity}</Td>
                <Td className="text-slate-300">{fmt(t.quantity_bought)}</Td>
                <Td className="text-slate-400">{fmtCurrency(t.buy_price_per_unit, t.currency)}</Td>
                <Td className="text-red-400">{fmtCurrency(t.total_cost, t.currency)}</Td>
                <Td className="text-slate-500">{t.sell_location || '—'}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Section>

      {/* ── Active runs ── */}
      <Section
        title={`Active runs · ${loc.activeRuns.length} run${loc.activeRuns.length !== 1 ? 's' : ''} based here`}
        icon={Activity}
        iconColor="text-slate-400"
        count={loc.activeRuns.length}
      >
        <div className="space-y-1">
          {loc.activeRuns.map((r: any) => (
            <Link
              key={r.id}
              to={`/runs/${r.id}`}
              className="flex items-center justify-between rounded-lg bg-[#0f1629] px-3 py-2 hover:bg-[#141c35] transition-colors"
            >
              <div className="flex items-center gap-2">
                <Badge label={r.type} />
                <span className="text-sm text-slate-200">{r.title || `Run #${r.id}`}</span>
              </div>
              <ExternalLink size={12} className="text-slate-600" />
            </Link>
          ))}
        </div>
      </Section>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export function Locations() {
  const [gameFilter, setGameFilter] = useState('');

  const { data: games = [] } = useQuery({ queryKey: ['games'], queryFn: gamesApi.list });
  const { data: locations = [], isLoading } = useQuery({
    queryKey: ['locations', gameFilter],
    queryFn: () => locationsApi.list(gameFilter ? { gameId: gameFilter } : undefined),
  });

  const locs = locations as any[];

  // Summary totals
  const totalItems = locs.reduce((s: number, l: any) => s + l.inventoryCount, 0);
  const totalRefining = locs.reduce((s: number, l: any) => s + l.refiningJobsCount, 0);
  const totalHauling = locs.reduce(
    (s: number, l: any) => s + l.haulingPickups.length + l.haulingDeliveries.length,
    0
  );
  const totalScuRefining = locs.reduce((s: number, l: any) => s + l.refiningScuIn, 0);

  const currency = gameFilter
    ? (games as any[]).find((g: any) => String(g.id) === gameFilter)?.currency || 'UEC'
    : 'UEC';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Locations</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {isLoading ? 'Loading…' : (
              locs.length === 0
                ? 'No locations tracked yet'
                : `${locs.length} location${locs.length !== 1 ? 's' : ''} · ${totalItems} inventory item${totalItems !== 1 ? 's' : ''} · ${totalRefining} refinery job${totalRefining !== 1 ? 's' : ''} · ${fmt(totalScuRefining)} SCU in refining`
            )}
          </p>
        </div>
        <select className="w-44" value={gameFilter} onChange={e => setGameFilter(e.target.value)}>
          <option value="">All games</option>
          {(games as any[]).map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>

      {/* Global chips when there are multiple locations */}
      {locs.length > 1 && (
        <div className="flex gap-4 px-1">
          {totalItems > 0 && (
            <span className="inline-flex items-center gap-1.5 text-sm text-emerald-400">
              <Package size={13} /> {totalItems} item{totalItems !== 1 ? 's' : ''} in stock
            </span>
          )}
          {totalRefining > 0 && (
            <span className="inline-flex items-center gap-1.5 text-sm text-amber-400">
              <Flame size={13} /> {totalRefining} refinery job{totalRefining !== 1 ? 's' : ''} · {fmt(totalScuRefining)} SCU
            </span>
          )}
          {totalHauling > 0 && (
            <span className="inline-flex items-center gap-1.5 text-sm text-sky-400">
              <Truck size={13} /> {totalHauling} hauling contract{totalHauling !== 1 ? 's' : ''} active
            </span>
          )}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && locs.length === 0 && (
        <Card>
          <div className="py-12 text-center space-y-2">
            <MapPin size={32} className="text-slate-700 mx-auto" />
            <p className="text-slate-400 font-medium">No locations tracked yet</p>
            <p className="text-sm text-slate-600">
              Locations are populated automatically when you tag inventory, refinery jobs, hauling contracts, or runs with a location.
            </p>
          </div>
        </Card>
      )}

      {/* Location cards */}
      <div className="space-y-4">
        {locs.map((loc: any) => (
          <LocationCard key={loc.name} loc={loc} currency={currency} />
        ))}
      </div>
    </div>
  );
}
