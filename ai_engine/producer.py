"""
MongoDB Log Producer - Simulates MongoDB logs (JSON format) and pushes to RabbitMQ.
Part of MongoDB Log Anomaly & Security Monitor for SmartBridge Hackathon.
"""

import json
import os
import random
import time
from datetime import datetime
from typing import Dict, Any

import pika


# Simulated MongoDB log templates for realistic log generation
LOG_TEMPLATES = [
    {"severity": "I", "msg": "connection accepted", "connectionId": "{}"},
    {"severity": "I", "msg": "connection ended", "connectionId": "{}"},
    {"severity": "W", "msg": "slow query", "durationMillis": {}},
    {"severity": "E", "msg": "authentication failed", "principalName": "{}"},
    {"severity": "I", "msg": "command completed", "command": "find", "durationMillis": {}},
    {"severity": "I", "msg": "command completed", "command": "aggregate", "durationMillis": {}},
    {"severity": "E", "msg": "connection refused", "remote": "{}"},
    {"severity": "W", "msg": "index build failed", "index": "{}"},
    {"severity": "I", "msg": "replication heartbeat", "term": {}, "oplogPosition": {}},
]

SEVERITY_WEIGHTS = {"I": 0.6, "W": 0.25, "E": 0.15}


def generate_log_entry() -> Dict[str, Any]:
    """Generate a single simulated MongoDB log entry in JSON format."""
    template = random.choice(LOG_TEMPLATES)
    entry = template.copy()

    # Add timestamp
    entry["t"] = {"$date": datetime.utcnow().isoformat() + "Z"}

    # Fill placeholders
    if "connectionId" in entry and "{}" in str(entry.get("connectionId", "")):
        entry["connectionId"] = random.randint(1000, 99999)
    if "durationMillis" in entry and isinstance(entry.get("durationMillis"), int):
        entry["durationMillis"] = random.randint(5, 5000)
    elif "durationMillis" in entry:
        entry["durationMillis"] = random.randint(5, 5000)
    if "principalName" in entry:
        entry["principalName"] = f"user_{random.randint(1, 100)}@example.com"
    if "remote" in entry:
        entry["remote"] = f"{random.randint(1, 255)}.{random.randint(0, 255)}.{random.randint(0, 255)}.{random.randint(1, 255)}:{random.randint(1024, 65535)}"
    if "index" in entry:
        entry["index"] = f"idx_{random.choice(['users', 'orders', 'sessions'])}_{random.randint(1, 10)}"
    if "term" in entry:
        entry["term"] = random.randint(1, 10)
    if "oplogPosition" in entry:
        entry["oplogPosition"] = random.randint(1000000, 9999999)

    return entry


def publish_log(connection: pika.BlockingConnection, exchange: str, routing_key: str, body: Dict[str, Any]) -> None:
    """Publish a log message to RabbitMQ."""
    channel = connection.channel()
    channel.basic_publish(
        exchange=exchange,
        routing_key=routing_key,
        body=json.dumps(body, default=str),
        properties=pika.BasicProperties(delivery_mode=2),
    )
    channel.close()

def main() -> None:
    """Run the log producer with retry logic for RabbitMQ connection."""
    # Use 'rabbitmq' as default for Docker internal networking
    host = os.getenv("RABBITMQ_HOST", "rabbitmq") 
    port = int(os.getenv("RABBITMQ_PORT", "5672"))
    queue = os.getenv("RABBITMQ_QUEUE", "mongodb_logs")
    interval_seconds = float(os.getenv("PRODUCER_INTERVAL", "2"))

    credentials = pika.PlainCredentials(
        os.getenv("RABBITMQ_USER", "guest"),
        os.getenv("RABBITMQ_PASS", "guest"),
    )
    parameters = pika.ConnectionParameters(host=host, port=port, credentials=credentials)

    # --- RETRY LOOP START ---
    connection = None
    print(f"[Producer] Attempting to connect to RabbitMQ at {host}:{port}...")
    
    while connection is None:
        try:
            connection = pika.BlockingConnection(parameters)
        except pika.exceptions.AMQPConnectionError:
            print("[Producer] RabbitMQ not ready yet. Retrying in 5 seconds...")
            time.sleep(5)
    # --- RETRY LOOP END ---

    channel = connection.channel()
    channel.queue_declare(queue=queue, durable=True)
    channel.close()

    print(f"[Producer] Connected! Publishing to '{queue}' every {interval_seconds}s.")

    try:
        while True:
            log_entry = generate_log_entry()
            # Note: Re-opening channel for each publish is fine for simulation,
            # but reuse the existing connection.
            publish_log(connection, "", queue, log_entry)
            print(f"[Producer] Published: {log_entry.get('msg', 'unknown')} (severity={log_entry.get('severity', '?')})")
            time.sleep(interval_seconds)
    except KeyboardInterrupt:
        print("\n[Producer] Stopped.")
    finally:
        if connection and not connection.is_closed:
            connection.close()
if __name__ == "__main__":
    main()
