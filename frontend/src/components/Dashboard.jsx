import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const THREAT_COLORS = {
  none: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: 'None' },
  low: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'Low' },
  medium: { bg: 'bg-orange-500/20', text: 'text-orange-400', label: 'Medium' },
  high: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'High' },
};

function ThreatGauge({ level }) {
  const config = THREAT_COLORS[level] || THREAT_COLORS.none;
  const pct = level === 'none' ? 0 : level === 'low' ? 25 : level === 'medium' ? 60 : 100;

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-6">
      <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-slate-400">Threat Level</h3>
      <div className="relative mx-auto h-32 w-32">
        <svg viewBox="0 0 100 100" className="-rotate-90">
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-slate-700"
          />
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${pct * 2.64} 264`}
            className={`${config.text} transition-all duration-500`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-2xl font-bold ${config.text}`}>{config.label}</span>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard({ stats, logs }) {
  const chartData = useMemo(() => {
    if (!logs || logs.length === 0) return [];
    const byMinute = {};
    logs
      .filter((l) => l.is_anomaly)
      .forEach((l) => {
        const ts = new Date(l.timestamp);
        const key = ts.toISOString().slice(0, 16);
        byMinute[key] = (byMinute[key] || 0) + 1;
      });
    return Object.entries(byMinute)
      .map(([time, count]) => ({ time, anomalies: count }))
      .sort((a, b) => a.time.localeCompare(b.time))
      .slice(-24);
  }, [logs]);

  if (!stats) {
    return (
      <div className="mb-8 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <div className="animate-pulse rounded-xl border border-slate-700/50 bg-slate-900/50 p-6">
          <div className="h-6 w-24 rounded bg-slate-700" />
          <div className="mt-2 h-10 w-16 rounded bg-slate-700" />
        </div>
        <div className="animate-pulse rounded-xl border border-slate-700/50 bg-slate-900/50 p-6">
          <div className="h-6 w-24 rounded bg-slate-700" />
          <div className="mt-2 h-10 w-16 rounded bg-slate-700" />
        </div>
        <div className="animate-pulse rounded-xl border border-slate-700/50 bg-slate-900/50 p-6">
          <div className="h-6 w-24 rounded bg-slate-700" />
          <div className="mt-2 h-10 w-16 rounded bg-slate-700" />
        </div>
        <div className="animate-pulse rounded-xl border border-slate-700/50 bg-slate-900/50 p-6">
          <div className="h-6 w-24 rounded bg-slate-700" />
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8 space-y-6">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-6">
          <h3 className="text-sm font-medium uppercase tracking-wider text-slate-400">Total Logs (24h)</h3>
          <p className="mt-2 text-3xl font-bold text-slate-100">{stats.total}</p>
        </div>
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-6">
          <h3 className="text-sm font-medium uppercase tracking-wider text-slate-400">Anomalies</h3>
          <p className="mt-2 text-3xl font-bold text-amber-400">{stats.anomalies}</p>
        </div>
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-6">
          <h3 className="text-sm font-medium uppercase tracking-wider text-slate-400">Anomaly Rate</h3>
          <p className="mt-2 text-3xl font-bold text-slate-100">{stats.anomalyRate}%</p>
        </div>
        <ThreatGauge level={stats.threatLevel} />
      </div>

      <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-6">
        <h3 className="mb-4 text-sm font-medium uppercase tracking-wider text-slate-400">
          Anomalies Over Time
        </h3>
        <div className="h-64">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="time" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Line type="monotone" dataKey="anomalies" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-slate-500">
              No anomaly data yet — logs will appear as they are analyzed.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
