# MongoDB Log Anomaly & Security Monitor

**SmartBridge MongoDB Hackathon** • Real-time AI-driven log monitoring with anomaly detection and security insights.

A full-stack system that collects MongoDB logs, processes them via RabbitMQ, analyzes them using **Isolation Forest** (scikit-learn) and **spaCy** (NLP), and displays results on a MERN dashboard.

---

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Producer       │────▶│  RabbitMQ    │────▶│  Detector       │────▶│  Backend        │
│  (Python)       │     │  (Queue)     │     │  (Isolation     │     │  (Node/Express) │
│  Simulates      │     │  mongodb_logs│     │   Forest+spaCy) │     │  MongoDB Atlas  │
│  MongoDB logs   │     └──────────────┘     └─────────────────┘     │  Socket.io      │
└─────────────────┘                                                  └────────┬────────┘
                                                                              │
                                                                              ▼
                                                                     ┌─────────────────┐
                                                                     │  Frontend       │
                                                                     │  React+Tailwind │
                                                                     │  Recharts       │
                                                                     └─────────────────┘
```

### Components

| Component | Tech | Role |
|-----------|------|------|
| **Producer** | Python, pika | Simulates MongoDB JSON logs, publishes to RabbitMQ |
| **Detector** | Python, scikit-learn, spaCy | Consumes logs, Isolation Forest anomaly detection, spaCy IP/error extraction, POSTs to backend |
| **Backend** | Node.js, Express, MongoDB | Time Series collections, Socket.io real-time, POST /api/logs, GET /api/stats |
| **Frontend** | React, Tailwind, Recharts | Dark-themed dashboard, anomaly line chart, threat gauge, real-time log feed |

### AI Logic & Anomaly Explanation

The detector explains **why** a log is flagged as an anomaly:

- **Severity**: Error (E) and Warning (W) are rarer than Info (I) → higher anomaly score
- **Duration**: Queries >3000ms deviate from typical patterns
- **Message patterns**: `auth`, `fail`, `refused` → security-relevant events
- **Isolation Forest**: Low decision score = outlier in feature space (severity, duration, connection ID, time-of-day)

---

## Business Impact

- **Security**: Detect authentication failures, connection refusals, and unusual access patterns
- **Performance**: Identify slow queries and index build failures early
- **Observability**: Real-time visibility into MongoDB behavior with AI-powered anomaly classification
- **Compliance**: Audit trail of anomalies with human-readable explanations

---

## Project Structure

```
mongodb-log-monitor/
├── ai_engine/
│   ├── producer.py      # Simulate MongoDB logs → RabbitMQ
│   ├── detector.py      # Consume, analyze (Isolation Forest + spaCy), POST to backend
│   ├── requirements.txt
│   └── Dockerfile
├── backend/
│   ├── server.js        # Express, MongoDB Atlas (Time Series), Socket.io
│   ├── package.json
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Dashboard.jsx   # Stats, Recharts line chart, Threat Level gauge
│   │   │   └── LogFeed.jsx    # Real-time log table with Anomaly badges
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.js
├── docker-compose.yml   # RabbitMQ, MongoDB, Backend, Producer, Detector
├── .env.example
└── README.md
```

---

## How to Run

### Prerequisites

- Node.js 18+
- Python 3.10+
- Docker & Docker Compose (for full stack)
- MongoDB Atlas URI or local MongoDB (optional, Docker includes MongoDB)

### Option 1: Docker Compose (Recommended)

```bash
# Clone and enter project
cd mongodb-log-monitor

# For MongoDB Atlas: create .env with your URI
# MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/log_monitor?retryWrites=true&w=majority
# Then start services (backend will use Atlas)
# For local MongoDB: omit MONGODB_URI and use Docker MongoDB

docker compose up -d

# Start frontend (outside Docker)
cd frontend && npm install && npm run dev
```

- **Backend**: http://localhost:3001  
- **Frontend**: http://localhost:5173  
- **RabbitMQ Management**: http://localhost:15672 (guest/guest)

### Option 2: Manual (Local Development)

**1. RabbitMQ**

```bash
docker run -d -p 5672:5672 -p 15672:15672 rabbitmq:3-management
```

**2. MongoDB**

Use MongoDB Atlas or local MongoDB. Set `MONGODB_URI` for Atlas.

**3. Backend**

```bash
cd backend
npm install
MONGODB_URI="your_atlas_uri" npm start
```

**4. AI Engine (Producer)**

```bash
cd ai_engine
pip install -r requirements.txt
python -m spacy download en_core_web_sm   # For spaCy NER
python producer.py
```

**5. AI Engine (Detector)** — in a separate terminal

```bash
cd ai_engine
BACKEND_URL=http://localhost:3001 python detector.py
```

**6. Frontend**

```bash
cd frontend
npm install
npm run dev
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/logs | Receive analyzed logs from AI engine |
| GET | /api/stats | Aggregate stats (total, anomalies, threat level, recent anomalies) |
| GET | /api/logs | Paginated log feed (?limit=50&skip=0) |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| MONGODB_URI | mongodb://mongodb:27017/log_monitor | MongoDB connection (Atlas or local) |
| FRONTEND_URL | http://localhost:5173 | CORS origin for Socket.io |
| RABBITMQ_HOST | localhost | RabbitMQ host |
| RABBITMQ_PORT | 5672 | RabbitMQ port |
| BACKEND_URL | http://localhost:3001 | Backend API (for detector) |
| PRODUCER_INTERVAL | 2 | Seconds between log emissions |

---

## License

MIT • SmartBridge MongoDB Hackathon
