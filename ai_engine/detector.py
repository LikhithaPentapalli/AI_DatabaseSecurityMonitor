"""
MongoDB Log Anomaly Detector - Consumes logs from RabbitMQ, detects anomalies
using Isolation Forest, extracts IPs/Error types with spaCy, and POSTs to backend.
Part of MongoDB Log Anomaly & Security Monitor for SmartBridge Hackathon.
"""

import json
import math
import os
import re
from collections import deque
from typing import Any, Dict, List, Optional

import pika
import requests
from sklearn.ensemble import IsolationForest

# spaCy for NER and entity extraction (IPs, error types)
try:
    import spacy
    SPACY_AVAILABLE = True
except ImportError:
    SPACY_AVAILABLE = False

# Numeric features used for Isolation Forest (must be consistent)
FEATURE_NAMES = ["severity_code", "duration_norm", "connection_id_norm", "hour_sin", "hour_cos"]

SEVERITY_MAP = {"I": 0, "W": 1, "E": 2}

# Keep a rolling window of normal samples for fitting
MAX_SAMPLES = 500
SAMPLE_QUEUE: deque = deque(maxlen=MAX_SAMPLES)

# Backend API URL (overridable via env)
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:3001")
API_LOGS = f"{BACKEND_URL}/api/logs"

# spaCy model (lazy load)
_nlp = None


def get_nlp():
    """Lazy-load spaCy model. Falls back to None if unavailable."""
    global _nlp
    if _nlp is not None:
        return _nlp
    if SPACY_AVAILABLE:
        try:
            _nlp = spacy.load("en_core_web_sm")
        except OSError:
            try:
                import subprocess
                subprocess.run(["python", "-m", "spacy", "download", "en_core_web_sm"], check=True)
                _nlp = spacy.load("en_core_web_sm")
            except Exception:
                _nlp = False
    else:
        _nlp = False
    return _nlp


def extract_features(log: Dict[str, Any]) -> List[float]:
    """Extract numeric features from a log for Isolation Forest."""
    severity = log.get("s", log.get("severity", "I"))
    severity_code = SEVERITY_MAP.get(severity, 0)

    duration = log.get("durationMillis", 0)
    if not isinstance(duration, (int, float)):
        duration = 0
    duration_norm = min(1.0, duration / 10000.0) if duration else 0.0

    conn_id = log.get("connectionId", 0)
    if not isinstance(conn_id, (int, float)):
        conn_id = 0
    connection_id_norm = (conn_id % 1000) / 1000.0 if conn_id else 0.0

    t = log.get("t", {})
    if isinstance(t, dict):
        date_str = t.get("$date", "")
    else:
        date_str = str(t)
    hour = 12
    if date_str:
        match = re.search(r"T(\d{2}):", str(date_str))
        if match:
            hour = int(match.group(1))
    hour_sin = math.sin(2 * math.pi * hour / 24)
    hour_cos = math.cos(2 * math.pi * hour / 24)

    return [severity_code, duration_norm, connection_id_norm, hour_sin, hour_cos]


def extract_entities_spacy(log: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract IPs and error types using spaCy NER + regex.
    spaCy: entities (ORG, PERSON, etc.), phrase matching for error types.
    Regex: IP addresses (spaCy does not detect IPs natively).
    """
    result = {"ips": [], "error_type": None, "entities": {}}

    text = json.dumps(log, default=str)
    msg = log.get("msg", "") or ""
    full_text = f"{msg} {text}"

    # Regex for IPs (spaCy NER does not detect IP addresses)
    ip_pattern = r"\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b"
    ips = re.findall(ip_pattern, full_text)
    result["ips"] = list(set(ips))

    # spaCy NER for entities (ORG, PERSON, GPE, etc.)
    nlp = get_nlp()
    if nlp:
        doc = nlp(full_text[:100000])  # spaCy limit
        for ent in doc.ents:
            key = ent.label_
            if key not in result["entities"]:
                result["entities"][key] = []
            if ent.text not in result["entities"][key]:
                result["entities"][key].append(ent.text)

    # Error type extraction: spaCy + heuristic patterns
    msg_lower = msg.lower()
    text_lower = full_text.lower()
    if "auth" in msg_lower or "authentication" in text_lower or "failed" in msg_lower and "principal" in text_lower:
        result["error_type"] = "Authentication"
    elif "refused" in msg_lower or "connection refused" in text_lower:
        result["error_type"] = "ConnectionRefused"
    elif "slow" in msg_lower or "slow query" in text_lower:
        result["error_type"] = "SlowQuery"
    elif "index" in msg_lower and ("fail" in text_lower or "build" in msg_lower):
        result["error_type"] = "IndexBuildFailure"
    elif "timeout" in text_lower:
        result["error_type"] = "Timeout"

    return result


def get_anomaly_reason(log: Dict[str, Any], is_anomaly: bool, score: float) -> str:
    """Provide human-readable explanation for why a log was flagged (or not)."""
    if not is_anomaly:
        return "Normal: Feature values within expected range."

    reasons = []
    severity = log.get("s", log.get("severity", "I"))
    if severity == "E":
        reasons.append("Error severity (E) is rare and increases anomaly score.")
    elif severity == "W":
        reasons.append("Warning severity (W) is less common than Info.")

    duration = log.get("durationMillis")
    if isinstance(duration, (int, float)) and duration > 3000:
        reasons.append(f"High duration ({duration}ms) deviates from typical query times.")

    msg = log.get("msg", "").lower()
    if "fail" in msg or "refused" in msg:
        reasons.append("Failure-related message pattern increases anomaly likelihood.")
    if "auth" in msg:
        reasons.append("Authentication events are monitored for security.")

    if not reasons:
        reasons.append(f"Isolation Forest score ({score:.3f}) indicates outlier in feature space.")

    return " | ".join(reasons)


def analyze_log(log: Dict[str, Any], model: Optional[IsolationForest]) -> Dict[str, Any]:
    """Analyze a single log: compute features, run Isolation Forest, extract entities."""
    features = extract_features(log)
    entities = extract_entities_spacy(log)

    is_anomaly = False
    score = 0.0
    model_used = False

    if model is not None:
        pred = model.predict([features])[0]
        score = float(model.decision_function([features])[0])
        is_anomaly = pred == -1
        model_used = True

    reason = get_anomaly_reason(log, is_anomaly, score)

    return {
        "log": log,
        "is_anomaly": is_anomaly,
        "anomaly_score": round(score, 4),
        "reason": reason,
        "entities": entities,
        "model_used": model_used,
    }


def post_to_backend(payload: Dict[str, Any]) -> bool:
    """POST analysis result to the backend API."""
    try:
        payload["is_anomaly"] = bool(payload["is_anomaly"])
        resp = requests.post(API_LOGS, json=payload, timeout=5)
        return 200 <= resp.status_code < 300
    except requests.RequestException as e:
        print(f"[Detector] Backend POST failed: {e}")
        return False


import time
import numpy as np # Ensure numpy is imported for type checking

def consume_and_analyze() -> None:
    """Consume logs from RabbitMQ with retry logic and clean JSON serialization."""
    host = os.getenv("RABBITMQ_HOST", "rabbitmq") # Changed to 'rabbitmq' for Docker internal net
    port = int(os.getenv("RABBITMQ_PORT", "5672"))
    queue = os.getenv("RABBITMQ_QUEUE", "mongodb_logs")

    credentials = pika.PlainCredentials(
        os.getenv("RABBITMQ_USER", "guest"),
        os.getenv("RABBITMQ_PASS", "guest"),
    )
    parameters = pika.ConnectionParameters(host=host, port=port, credentials=credentials)

    # --- FIX 1: CONNECTION RETRY LOOP ---
    connection = None
    while connection is None:
        try:
            print(f"[Detector] Attempting to connect to RabbitMQ at {host}:{port}...")
            connection = pika.BlockingConnection(parameters)
        except pika.exceptions.AMQPConnectionError:
            print("[Detector] RabbitMQ not ready yet. Retrying in 5 seconds...")
            time.sleep(5)

    channel = connection.channel()
    channel.queue_declare(queue=queue, durable=True)

    model: Optional[IsolationForest] = None

    def callback(ch, method, properties, body):
        nonlocal model
        try:
            log = json.loads(body)
        except json.JSONDecodeError:
            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
            return

        features = extract_features(log)
        SAMPLE_QUEUE.append(features)

        if len(SAMPLE_QUEUE) >= 50 and model is None:
            X = list(SAMPLE_QUEUE)
            model = IsolationForest(contamination=0.1, random_state=42)
            model.fit(X)
            print("[Detector] Isolation Forest model fitted on initial samples.")

        result = analyze_log(log, model)
        
        # --- FIX 2: CONVERT NUMPY TYPES TO NATIVE PYTHON ---
        # This prevents the 'Object of type bool/int64 is not JSON serializable' error
        clean_result = {}
        for k, v in result.items():
            if isinstance(v, (np.bool_, bool)):
                clean_result[k] = bool(v)
            elif isinstance(v, (np.integer, int)):
                clean_result[k] = int(v)
            elif isinstance(v, (np.floating, float)):
                clean_result[k] = float(v)
            else:
                clean_result[k] = v

        success = post_to_backend(clean_result)
        
        if success and clean_result.get("is_anomaly"):
            print(f"[Detector] Anomaly detected: {clean_result['log'].get('msg', '?')[:50]}...")

        ch.basic_ack(delivery_tag=method.delivery_tag)

    channel.basic_consume(queue=queue, on_message_callback=callback)
    print("[Detector] Consuming logs. Waiting for messages...")
    channel.start_consuming()

if __name__ == "__main__":
    try:
        consume_and_analyze()
    except Exception as e:
        print(f"[Detector] Fatal error: {e}")