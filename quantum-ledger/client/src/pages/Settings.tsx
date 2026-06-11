import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { settingsApi } from '@/lib/api';

export function Settings() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
  });
  const [logPath, setLogPath] = useState('');
  const [saved, setSaved] = useState(false);

  const [clanHandle, setClanHandle] = useState('');
  const [clanServerUrl, setClanServerUrl] = useState('');
  const [clanServerId, setClanServerId] = useState('');
  const [clanAuthToken, setClanAuthToken] = useState('');
  const [clanAuthTokenSet, setClanAuthTokenSet] = useState(false);
  const [clanSyncEnabled, setClanSyncEnabled] = useState(false);
  const [clanError, setClanError] = useState<string | null>(null);
  const [clanSaved, setClanSaved] = useState(false);

  useEffect(() => {
    if (!settings) return;
    const s = settings as any;
    if (Object.prototype.hasOwnProperty.call(s, 'logPath')) {
      setLogPath(s.logPath ?? '');
    }
    setClanHandle(s.clanHandle ?? '');
    setClanServerUrl(s.clanServerUrl ?? '');
    setClanServerId(s.clanServerId ?? '');
    setClanAuthTokenSet(s.clanAuthTokenSet === 'true');
    setClanSyncEnabled(s.clanSyncEnabled === 'true');
  }, [settings]);

  const updateSettings = useMutation({
    mutationFn: (payload: { logPath: string }) => settingsApi.update(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const updateClanSync = useMutation({
    mutationFn: (payload: {
      clanSyncEnabled: boolean;
      clanHandle: string;
      clanServerUrl: string;
      clanServerId: string;
      clanAuthToken: string;
    }) => settingsApi.update(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      setClanAuthToken('');
      setClanError(null);
      setClanSaved(true);
      setTimeout(() => setClanSaved(false), 2500);
    },
    onError: (err: any) => {
      setClanSaved(false);
      setClanError(err?.response?.data?.error ?? 'Failed to save clan sync settings.');
    },
  });

  const clanSettingsChanged = settings
    ? clanHandle !== ((settings as any).clanHandle ?? '')
      || clanServerUrl !== ((settings as any).clanServerUrl ?? '')
      || clanServerId !== ((settings as any).clanServerId ?? '')
      || clanAuthToken !== ''
      || clanSyncEnabled !== ((settings as any).clanSyncEnabled === 'true')
    : false;

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Application preferences and tools for Star Citizen tracking.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Game.log path</CardTitle></CardHeader>
        <div className="p-4 space-y-4 text-sm text-slate-300">
          <p>
            Configure the Star Citizen install path or direct Game.log path used by the app for real-time blueprint tracking.
            The watcher will use this location on startup and when the setting is saved.
          </p>
          <div className="space-y-2">
            <label className="block text-xs uppercase tracking-[0.18em] text-slate-500">Game.log path</label>
            <input
              type="text"
              value={logPath}
              onChange={e => setLogPath(e.target.value)}
              placeholder="C:\\Program Files\\Roberts Space Industries\\StarCitizen"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200"
            />
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => updateSettings.mutate({ logPath })}
              disabled={updateSettings.isPending || logPath === ((settings as any)?.logPath ?? '')}
            >
              Save path
            </Button>
            {saved && (
              <span className="text-sm text-emerald-400">Saved and watcher restarted.</span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            You can enter the game install directory, the LIVE folder, or the full path to Game.log.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader><CardTitle>Clan sync</CardTitle></CardHeader>
        <div className="p-4 space-y-4 text-sm text-slate-300">
          <p>
            Optionally share newly-discovered blueprints with your clan's data server in real time.
            Ask your clan leader for the server's URL, Server ID and Auth Token.
          </p>
          <div className="space-y-2">
            <label className="block text-xs uppercase tracking-[0.18em] text-slate-500">Your handle</label>
            <input
              type="text"
              value={clanHandle}
              onChange={e => setClanHandle(e.target.value)}
              placeholder="In-game handle shown to your clan"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-xs uppercase tracking-[0.18em] text-slate-500">Server URL</label>
            <input
              type="text"
              value={clanServerUrl}
              onChange={e => setClanServerUrl(e.target.value)}
              placeholder="https://clan.example.com"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-xs uppercase tracking-[0.18em] text-slate-500">Server ID</label>
            <input
              type="text"
              value={clanServerId}
              onChange={e => setClanServerId(e.target.value)}
              placeholder="Shown in the server's dashboard / startup log"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 font-mono"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-xs uppercase tracking-[0.18em] text-slate-500">Auth token</label>
            <input
              type="password"
              value={clanAuthToken}
              onChange={e => setClanAuthToken(e.target.value)}
              placeholder={clanAuthTokenSet ? 'Token saved — leave blank to keep it' : 'Shared by your clan leader'}
              autoComplete="off"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 font-mono"
            />
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={clanSyncEnabled}
              onChange={e => setClanSyncEnabled(e.target.checked)}
              className="w-3.5 h-3.5 cursor-pointer accent-blue-500"
            />
            <span className="text-sm text-slate-300">Enable clan sync</span>
          </label>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => updateClanSync.mutate({ clanSyncEnabled, clanHandle, clanServerUrl, clanServerId, clanAuthToken })}
              disabled={updateClanSync.isPending || !clanSettingsChanged}
            >
              {updateClanSync.isPending ? 'Checking connection…' : 'Save clan sync settings'}
            </Button>
            {clanSaved && (
              <span className="text-sm text-emerald-400">
                {clanSyncEnabled ? 'Connected — sharing blueprints with your clan.' : 'Saved.'}
              </span>
            )}
            {clanError && (
              <span className="text-sm text-rose-400">{clanError}</span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            When enabled, every newly-discovered blueprint is sent to the clan server under your handle.
            Your local data stays untouched either way — this only shares blueprint discoveries going forward.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader><CardTitle>Help</CardTitle></CardHeader>
        <div className="p-4 text-sm text-slate-500 space-y-2">
          <p>The app tracks Star Citizen blueprints automatically from the configured Game.log path.</p>
          <p>If you need to reset or manage the underlying database, use the local data files or the server API directly.</p>
        </div>
      </Card>
    </div>
  );
}
