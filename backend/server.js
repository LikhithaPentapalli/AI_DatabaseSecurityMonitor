/**
 * MongoDB Log Anomaly & Security Monitor - Backend
 * SmartBridge MongoDB Hackathon
 *
 * Express server with MongoDB Atlas (Time Series), Socket.io for real-time updates,
 * and routes: POST /api/logs, GET /api/stats
 */

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL || 'http://localhost:5173' },
});

app.use(cors());
app.use(express.json());

// MongoDB connection - use Time Series Collection
const MONGODB_URI =
  process.env.MONGODB_URI ||
  'mongodb+srv://demo:demo@cluster0.example.mongodb.net/log_monitor?retryWrites=true&w=majority';

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log('[Backend] Connected to MongoDB Atlas'))
  .catch((err) => console.error('[Backend] MongoDB connection error:', err.message));

// Log schema: Time Series compatible for MongoDB Atlas 5.0+
// meta field required for timeseries.metaField; enables efficient time-range queries
const logSchema = new mongoose.Schema(
  {
    timestamp: { type: Date, default: Date.now },
    meta: {
      source: { type: String, default: 'ai_engine' },
      severity: String,
    },
    log: mongoose.Schema.Types.Mixed,
    is_anomaly: Boolean,
    anomaly_score: Number,
    reason: String,
    entities: mongoose.Schema.Types.Mixed,
    model_used: Boolean,
  },
  {
    timeseries: {
      timeField: 'timestamp',
      metaField: 'meta',
      granularity: 'seconds',
    },
    collection: 'logs',
  }
);

const LogModel = mongoose.model('Log', logSchema);

// POST /api/logs - Receive analyzed logs from AI engine
app.post('/api/logs', (req, res) => {
  const payload = req.body;
  if (!payload || typeof payload.log === 'undefined') {
    return res.status(400).json({ error: 'Invalid payload: log required' });
  }

  const doc = {
    timestamp: new Date(),
    meta: {
      source: 'ai_engine',
      severity: payload.log?.severity || payload.log?.s || 'I',
    },
    log: payload.log,
    is_anomaly: !!payload.is_anomaly,
    anomaly_score: payload.anomaly_score ?? 0,
    reason: payload.reason || '',
    entities: payload.entities || {},
    model_used: !!payload.model_used,
  };

  LogModel.create(doc)
    .then((saved) => {
      io.emit('log', saved);
      res.status(201).json({ id: saved._id, ok: true });
    })
    .catch((err) => {
      console.error('[Backend] DB error:', err.message);
      res.status(500).json({ error: 'Failed to save log' });
    });
});

// GET /api/stats - Aggregate statistics for dashboard
app.get('/api/stats', async (req, res) => {
  try {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [total, anomalies, recentAnomalies] = await Promise.all([
      LogModel.countDocuments({ timestamp: { $gte: oneDayAgo } }),
      LogModel.countDocuments({ timestamp: { $gte: oneDayAgo }, is_anomaly: true }),
      LogModel.find({ timestamp: { $gte: oneDayAgo }, is_anomaly: true })
        .sort({ timestamp: -1 })
        .limit(100)
        .lean(),
    ]);

    const anomalyRate = total > 0 ? (anomalies / total) * 100 : 0;
    const threatLevel =
      anomalyRate > 10 ? 'high' : anomalyRate > 3 ? 'medium' : anomalyRate > 0 ? 'low' : 'none';

    res.json({
      total,
      anomalies,
      anomalyRate: Math.round(anomalyRate * 100) / 100,
      threatLevel,
      recentAnomalies: recentAnomalies.map((a) => ({
        timestamp: a.timestamp,
        msg: a.log?.msg,
        reason: a.reason,
        score: a.anomaly_score,
      })),
    });
  } catch (err) {
    console.error('[Backend] Stats error:', err.message);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/logs - Paginated log feed for frontend
app.get('/api/logs', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const skip = parseInt(req.query.skip, 10) || 0;

  try {
    const [logs, total] = await Promise.all([
      LogModel.find().sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
      LogModel.countDocuments(),
    ]);

    res.json({ logs, total });
  } catch (err) {
    console.error('[Backend] Logs fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`[Backend] Server running on http://localhost:${PORT}`);
});
