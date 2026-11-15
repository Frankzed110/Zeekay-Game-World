"""Zeekay Game World — cloud saves, scores and the Hall of Champions."""
import asyncio
import logging
import os
from contextlib import suppress
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

from models import PlayerDoc, SaveDoc, ScoreDoc

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

INDEXES: dict[str, list[IndexModel]] = {
    "players": [IndexModel([("player_key", ASCENDING)], name="player_key", unique=True)],
    "saves": [IndexModel([("player_key", ASCENDING)], name="player_key", unique=True)],
    "scores": [
        IndexModel([("mode", ASCENDING), ("score", DESCENDING)], name="mode_score_desc"),
        IndexModel([("player_key", ASCENDING)], name="player_key"),
    ],
}

# Input guards (light validation — scores are client-authoritative in v1).
PLAYER_KEY = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
DISPLAY_NAME_MAX = 24
MODE_PATTERN = r"^[a-z][a-z0-9_]{2,39}$"
MAX_SCORE = 10_000_000


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:
                logging.getLogger(__name__).error("ensure_indexes(%s): %s", collection, exc)


app = FastAPI(title="Zeekay Game World")


@app.get("/health", include_in_schema=False)
@app.head("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}


api_router = APIRouter(prefix="/api")


class PlayerIn(BaseModel):
    player_key: str = PLAYER_KEY
    display_name: str = Field("Archer", min_length=1, max_length=DISPLAY_NAME_MAX)


class SaveIn(BaseModel):
    player_key: str = PLAYER_KEY
    payload: Dict[str, Any] = Field(default_factory=dict)
    updated_at: str = Field("", max_length=40)
    display_name: Optional[str] = Field(None, max_length=DISPLAY_NAME_MAX)


class ScoreIn(BaseModel):
    player_key: str = PLAYER_KEY
    display_name: str = Field("Archer", min_length=1, max_length=DISPLAY_NAME_MAX)
    mode: str = Field(pattern=MODE_PATTERN)
    arena_id: str = Field("", max_length=40)
    score: int = Field(0, ge=0, le=MAX_SCORE)
    wave: int = Field(0, ge=0, le=100_000)
    difficulty: str = Field("normal", pattern=r"^(story|normal|hero|legend)$")
    meta: Dict[str, Any] = Field(default_factory=dict)


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def touch_player(player_key: str, display_name: Optional[str] = None) -> None:
    update: Dict[str, Any] = {"$set": {"last_seen": datetime.now(timezone.utc)}}
    if display_name:
        update["$set"]["display_name"] = display_name
    await db.players.update_one({"player_key": player_key}, update, upsert=True)


@api_router.post("/players/register")
async def register_player(input: PlayerIn):
    await touch_player(input.player_key, input.display_name)
    doc = await db.players.find_one({"player_key": input.player_key})
    return {"ok": True, "player": PlayerDoc(**doc).public() if doc else None}


@api_router.post("/save")
async def push_save(input: SaveIn):
    await touch_player(input.player_key, input.display_name)
    await db.saves.update_one(
        {"player_key": input.player_key},
        {"$set": {"payload": input.payload, "updated_at": input.updated_at or now()}},
        upsert=True,
    )
    return {"ok": True, "synced_at": now()}


@api_router.get("/save/{player_key}")
async def pull_save(player_key: str):
    if not (8 <= len(player_key) <= 64):
        raise HTTPException(status_code=422, detail="invalid player_key")
    doc = await db.saves.find_one({"player_key": player_key})
    if not doc:
        return {"found": False, "payload": None, "updated_at": None}
    save = SaveDoc(**doc)
    return {"found": True, "payload": save.payload, "updated_at": save.updated_at}


@api_router.post("/scores")
async def post_score(input: ScoreIn):
    await touch_player(input.player_key, input.display_name)
    doc = ScoreDoc(**input.model_dump())
    await db.scores.insert_one(doc.to_mongo())
    best_me_list = await db.scores.find({"mode": input.mode, "player_key": input.player_key}).sort("score", -1).to_list(1)
    my_best = best_me_list[0]["score"] if best_me_list else 0
    better_players = await db.scores.distinct("player_key", {"mode": input.mode, "score": {"$gt": my_best}})
    return {"ok": True, "rank": len(better_players) + 1, "best": my_best}


@api_router.get("/leaderboard")
async def leaderboard(mode: str = Query(..., pattern=MODE_PATTERN), limit: int = Query(50, ge=1, le=100)):
    docs = await db.scores.find({"mode": mode}).sort("score", -1).limit(400).to_list(400)
    seen: Dict[str, Dict[str, Any]] = {}
    for d in docs:
        key = d["player_key"]
        if key not in seen:
            seen[key] = {
                "player_key": key,
                "display_name": d.get("display_name", "Archer"),
                "score": d["score"],
                "wave": d.get("wave", 0),
                "difficulty": d.get("difficulty", "normal"),
                "arena_id": d.get("arena_id", ""),
            }
    entries = sorted(seen.values(), key=lambda e: e["score"], reverse=True)[:limit]
    for i, e in enumerate(entries):
        e["rank"] = i + 1
    return {"mode": mode, "entries": entries}


@api_router.get("/champions")
async def champions():
    modes = ["arena_duel", "arena_survival", "arena_tournament", "arena_coop"]
    by_mode: Dict[str, List[Dict[str, Any]]] = {}
    totals: Dict[str, Dict[str, Any]] = {}
    for mode in modes:
        docs = await db.scores.find({"mode": mode}).sort("score", -1).limit(200).to_list(200)
        seen: Dict[str, Dict[str, Any]] = {}
        for d in docs:
            key = d["player_key"]
            if key not in seen:
                seen[key] = {
                    "player_key": key,
                    "display_name": d.get("display_name", "Archer"),
                    "score": d["score"],
                    "difficulty": d.get("difficulty", "normal"),
                }
        top = sorted(seen.values(), key=lambda e: e["score"], reverse=True)[:10]
        for i, e in enumerate(top):
            e["rank"] = i + 1
        by_mode[mode] = top
        for e in top:
            t = totals.setdefault(
                e["player_key"],
                {"player_key": e["player_key"], "display_name": e["display_name"], "score": 0, "modes": []},
            )
            t["score"] += e["score"]
            t["modes"].append(mode)
    hall = sorted(totals.values(), key=lambda e: e["score"], reverse=True)[:10]
    for i, e in enumerate(hall):
        e["rank"] = i + 1
    return {"by_mode": by_mode, "hall": hall}


@api_router.get("/")
async def root():
    return {"message": "Zeekay Game World API"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def start_index_build():
    app.state.index_task = asyncio.create_task(ensure_indexes())


@app.on_event("shutdown")
async def shutdown_db_client():
    app.state.index_task.cancel()
    with suppress(asyncio.CancelledError):
        await app.state.index_task
    client.close()
