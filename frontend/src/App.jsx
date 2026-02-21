import { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import LogFeed from './components/LogFeed';
import { motion, AnimatePresence } from "framer-motion";
import useSound from 'use-sound';
import alertSfx from './assets/alert.mp3'; // Add a short mp3 file here

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

function App() {
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/stats`);
        if (res.ok) setStats(await res.json());
      } catch (e) {
        console.warn('Stats fetch failed:', e);
      }
    };
   
    
    const Dashboard = () => {
      const [play] = useSound(alertSfx);
      const [alerts, setAlerts] = useState([]);
    
      useEffect(() => {
        socket.on("anomaly_detected", (data) => {
          setAlerts((prev) => [data, ...prev]);
          play(); // Trigger sound the moment the AI flags a log
        });
        
        return () => socket.off("anomaly_detected");
      }, [play]);
      const [logs, setLogs] = useState([]);

      // Function to clear only the UI
      const clearUI = () => {
        setLogs([]); // Wipes the local list, but keeps the DB safe!
      };
    
      return (
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">AI Threat Monitor</h1>
            
            {/* The Clear Button */}
            <button 
              onClick={clearUI}
              className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-md transition"
            >
              Clear Screen
            </button>
          </div>
    
          {/* Your list of logs goes here */}
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className={log.is_anomaly ? 'bg-red-900' : 'bg-gray-800'}>
                {log.message}
              </div>
            ))}
          </div>
        </div>
      );
    };
    const AnomalyAlert = ({ alert }) => (
      <motion.div
        initial={{ x: 300, opacity: 0 }} // Starts off-screen to the right
        animate={{ x: 0, opacity: 1 }}   // Slides in
        exit={{ opacity: 0, scale: 0.5 }} // Shrinks when dismissed
        className="bg-red-600 text-white p-4 rounded-lg shadow-lg mb-2 flex justify-between"
      >
        <span>🚨 Anomaly: {alert.event}</span>
        <span className="font-bold">{alert.risk_score * 100}% Risk</span>
      </motion.div>
    );
    const fetchLogs = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/logs?limit=50`);
        if (res.ok) {
          const { logs: data } = await res.json();
          setLogs(data || []);
        }
      } catch (e) {
        console.warn('Logs fetch failed:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    fetchLogs();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/50 px-6 py-4">
        <h1 className="text-xl font-semibold tracking-tight text-emerald-400">
          MongoDB Log Anomaly & Security Monitor
        </h1>
        <p className="mt-1 text-sm text-slate-400">Real-time AI-driven monitoring</p>
      </header>

      <main className="p-6">
        <Dashboard stats={stats} logs={logs} />
        <LogFeed logs={logs} loading={loading} setLogs={setLogs} backendUrl={BACKEND_URL} />
      </main>
    </div>
  );
}

export default App;
