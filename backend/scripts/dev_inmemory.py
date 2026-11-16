"""Run the API against an in-memory Mongo (mongomock-motor) — for local dev/e2e without MongoDB.

Usage: python scripts/dev_inmemory.py   (serves on 0.0.0.0:8001)
Data is lost on exit. Production uses MONGO_URL from .env.
"""
import os
import sys
from pathlib import Path

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "zeekay_dev")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import uvicorn  # noqa: E402
from mongomock_motor import AsyncMongoMockClient  # noqa: E402

import server  # noqa: E402

server.db = AsyncMongoMockClient()[os.environ["DB_NAME"]]

if __name__ == "__main__":
    uvicorn.run(server.app, host="0.0.0.0", port=8001, log_level="warning")
