"""API tests against an in-memory Mongo (mongomock-motor)."""
import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "zeekay_test")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import server  # noqa: E402

KEY_A = "a1b2c3d4-0000-4000-8000-00000000000a"
KEY_B = "a1b2c3d4-0000-4000-8000-00000000000b"
KEY_C = "a1b2c3d4-0000-4000-8000-00000000000c"


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setattr(server, "db", AsyncMongoMockClient()["zeekay_test"])
    with TestClient(server.app) as c:
        yield c


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/api/").json()["message"] == "Zeekay Game World API"


def test_register_and_rename(client):
    r = client.post("/api/players/register", json={"player_key": KEY_A, "display_name": "Kaia"})
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] and body["player"]["display_name"] == "Kaia"
    assert isinstance(body["player"]["id"], str)
    r = client.post("/api/players/register", json={"player_key": KEY_A, "display_name": "Kaia II"})
    assert r.json()["player"]["display_name"] == "Kaia II"


def test_save_roundtrip(client):
    assert client.get(f"/api/save/{KEY_A}").json() == {"found": False, "payload": None, "updated_at": None}
    payload = {"version": 1, "profile": {"level": 3, "gold": 120}}
    r = client.post("/api/save", json={"player_key": KEY_A, "payload": payload, "updated_at": "2026-01-01T00:00:00Z"})
    assert r.json()["ok"]
    got = client.get(f"/api/save/{KEY_A}").json()
    assert got["found"] and got["payload"] == payload and got["updated_at"] == "2026-01-01T00:00:00Z"
    # overwrite (upsert)
    payload2 = {"version": 1, "profile": {"level": 4}}
    client.post("/api/save", json={"player_key": KEY_A, "payload": payload2, "updated_at": "2026-01-02T00:00:00Z"})
    assert client.get(f"/api/save/{KEY_A}").json()["payload"] == payload2


def test_scores_rank_and_leaderboard(client):
    def post(key, name, score, mode="arena_survival"):
        return client.post(
            "/api/scores",
            json={"player_key": key, "display_name": name, "mode": mode, "score": score, "wave": 3},
        ).json()

    assert post(KEY_A, "A", 500)["rank"] == 1
    assert post(KEY_B, "B", 900)["rank"] == 1
    r = post(KEY_A, "A", 300)  # lower than personal best — best stays 500
    assert r["best"] == 500 and r["rank"] == 2
    assert post(KEY_C, "C", 700)["rank"] == 2

    lb = client.get("/api/leaderboard", params={"mode": "arena_survival"}).json()
    assert [e["display_name"] for e in lb["entries"]] == ["B", "C", "A"]
    assert [e["rank"] for e in lb["entries"]] == [1, 2, 3]
    assert lb["entries"][2]["score"] == 500  # best per player

    post(KEY_A, "A", 2000, mode="arena_duel")
    champs = client.get("/api/champions").json()
    assert set(champs["by_mode"]) == {"arena_duel", "arena_survival", "arena_tournament", "arena_coop"}
    assert champs["hall"][0]["display_name"] == "A"
    assert champs["hall"][0]["score"] == 2500
    assert sorted(champs["hall"][0]["modes"]) == ["arena_duel", "arena_survival"]


def test_validation(client):
    bad = client.post("/api/scores", json={"player_key": KEY_A, "mode": "arena_duel", "score": -5})
    assert bad.status_code == 422
    bad = client.post("/api/scores", json={"player_key": "x", "mode": "arena_duel", "score": 5})
    assert bad.status_code == 422
    bad = client.post("/api/scores", json={"player_key": KEY_A, "mode": "DROP TABLE", "score": 5})
    assert bad.status_code == 422
    assert client.get("/api/leaderboard").status_code == 422
