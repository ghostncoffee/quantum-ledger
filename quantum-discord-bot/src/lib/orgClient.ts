import { config } from '../config';

export type StatsPeriod = 'today' | 'week' | 'month' | 'all_time';

export interface ClanStats {
  period: string;
  sessionCount: number;
  activeMembers: number;
  memberCount: number;
  sessionsByType: { session_type: string; count: number }[];
}

export interface FleetShip {
  name: string;
  type: string;
  scu_capacity: number;
  count: number;
}

export interface BlueprintEntry {
  product_name: string;
  members: string[];
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${config.orgServerUrl}${path}`, {
    headers: { Authorization: `Bearer ${config.orgServerAuthToken}` },
  });

  if (!res.ok) {
    throw new Error(`Org server responded with ${res.status} for ${path}`);
  }

  return res.json() as Promise<T>;
}

export function fetchClanStats(period: StatsPeriod): Promise<ClanStats> {
  return get<ClanStats>(`/api/stats/clan?period=${period}`);
}

export function fetchFleet(): Promise<FleetShip[]> {
  return get<FleetShip[]>('/api/members/ships');
}

export function fetchBlueprints(): Promise<BlueprintEntry[]> {
  return get<BlueprintEntry[]>('/api/blueprints');
}
