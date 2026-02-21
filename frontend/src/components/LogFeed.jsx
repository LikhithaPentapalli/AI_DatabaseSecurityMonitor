import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

export default function LogFeed({ logs, loading, setLogs, backendUrl }) {
  const listRef = useRef(null);

  useEffect(() => {
    const socket = io(backendUrl, { transports: ['websocket', 'polling'] });

    socket.on('log', (log) => {
      setLogs((prev) => [log, ...prev].slice(0, 200));
    });

    return () => socket.disconnect();
  }, [backendUrl, setLogs]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = 0;
  }, [logs]);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-200">Real-time Log Feed</h2>
        <div className="flex h-64 items-center justify-center text-slate-500">Loading logs...</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-6">
      <h2 className="mb-4 text-lg font-semibold text-slate-200">Real-time Log Feed</h2>
      <div
        ref={listRef}
        className="max-h-96 overflow-y-auto overflow-x-auto rounded-lg border border-slate-700/50"
      >
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 bg-slate-800/95 text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Message</th>
              <th className="px-4 py-3 font-medium">Severity</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No logs yet. Start the producer and detector to see real-time logs.
                </td>
              </tr>
            ) : (
              logs.map((entry, i) => (
                <tr
                  key={entry._id || i}
                  className={`border-t border-slate-700/50 ${
                    entry.is_anomaly ? 'bg-amber-500/5' : 'bg-slate-900/30'
                  }`}
                >
                  <td className="whitespace-nowrap px-4 py-2 text-slate-400">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="px-4 py-2 font-mono text-slate-200">
                    {entry.log?.msg || JSON.stringify(entry.log).slice(0, 50)}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
                        entry.log?.severity === 'E'
                          ? 'bg-red-500/20 text-red-400'
                          : entry.log?.severity === 'W'
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-slate-600/50 text-slate-300'
                      }`}
                    >
                      {entry.log?.severity || entry.log?.s || 'I'}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {entry.is_anomaly ? (
                      <span className="inline-flex rounded bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-400">
                        Anomaly
                      </span>
                    ) : (
                      <span className="inline-flex rounded bg-slate-600/50 px-2 py-0.5 text-xs text-slate-400">
                        Normal
                      </span>
                    )}
                  </td>
                  <td className="max-w-xs truncate px-4 py-2 text-slate-400" title={entry.reason}>
                    {entry.reason || '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
