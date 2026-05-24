import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Pickaxe, TrendingUp, Wrench, FileText,
  Package, MapPin, Users, Car, BookOpen, ChevronRight, Gamepad2, FlaskConical,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const nav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/runs', icon: ChevronRight, label: 'All Runs' },
  { label: '─', divider: true },
  { to: '/mining', icon: Pickaxe, label: 'Mining' },
  { to: '/refining', icon: FlaskConical, label: 'Refining' },
  { to: '/trading', icon: TrendingUp, label: 'Trading' },
  { to: '/crafting', icon: Wrench, label: 'Crafting' },
  { to: '/contracts', icon: FileText, label: 'Contracts' },
  { label: '─', divider: true },
  { to: '/accounting', icon: BookOpen, label: 'Accounting' },
  { to: '/inventory', icon: Package, label: 'Inventory' },
  { to: '/locations', icon: MapPin, label: 'Locations' },
  { label: '─', divider: true },
  { to: '/crew', icon: Users, label: 'Crew' },
  { to: '/vehicles', icon: Car, label: 'Vehicles' },
  { to: '/settings', icon: Gamepad2, label: 'Games' },
];

export function Sidebar() {
  return (
    <aside className="flex h-screen w-56 flex-col border-r border-[#1e2d4f] bg-[#0a0e1a]">
      <div className="flex items-center gap-2 px-4 py-4 border-b border-[#1e2d4f]">
        <div className="h-7 w-7 rounded-lg bg-blue-600 flex items-center justify-center">
          <Gamepad2 size={14} className="text-white" />
        </div>
        <span className="font-bold text-slate-100 text-sm">Game Ledger</span>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {nav.map((item, i) => {
          if ('divider' in item) {
            return <div key={i} className="my-2 border-t border-[#1e2d4f]/50" />;
          }
          const Icon = item.icon!;
          return (
            <NavLink
              key={item.to}
              to={item.to!}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors mb-0.5',
                  isActive
                    ? 'bg-blue-600/20 text-blue-300 border border-blue-700/40'
                    : 'text-slate-400 hover:bg-[#141c35] hover:text-slate-200'
                )
              }
            >
              <Icon size={15} />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="px-4 py-3 border-t border-[#1e2d4f]">
        <p className="text-xs text-slate-600">v0.1.9 — local only</p>
      </div>
    </aside>
  );
}
