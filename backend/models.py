"""MongoDB document models for Zeekay Game World backend."""
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from bson import ObjectId
from pydantic import BaseModel, BeforeValidator, Field
from typing_extensions import Annotated


def _to_object_id(v: Any) -> Any:
    if isinstance(v, ObjectId):
        return v
    try:
        return ObjectId(str(v))
    except Exception:
        return None


PyObjectId = Annotated[ObjectId, BeforeValidator(_to_object_id)]


class BaseDocument(BaseModel):
    """Base model mapping Mongo `_id` -> `id` and serializing safely."""

    id: PyObjectId = Field(default_factory=ObjectId, alias="_id")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    deleted_at: Optional[datetime] = None

    model_config = {
        "populate_by_name": True,
        "arbitrary_types_allowed": True,
        "json_encoders": {ObjectId: str},
    }

    def to_mongo(self) -> Dict[str, Any]:
        doc = self.model_dump(by_alias=True)
        return dict(doc)

    @classmethod
    def from_mongo(cls, doc: Dict[str, Any]) -> "BaseDocument":
        if not doc:
            raise ValueError("empty document")
        return cls(**doc)

    def public(self) -> Dict[str, Any]:
        data = self.model_dump(mode="json", by_alias=True)
        data["id"] = str(data.pop("_id", self.id))
        return data


class PlayerDoc(BaseDocument):
    player_key: str
    display_name: str = "Archer"
    last_seen: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SaveDoc(BaseDocument):
    player_key: str
    payload: Dict[str, Any] = Field(default_factory=dict)
    updated_at: str = ""


class ScoreDoc(BaseDocument):
    player_key: str
    display_name: str = "Archer"
    mode: str
    arena_id: str = ""
    score: int = 0
    wave: int = 0
    difficulty: str = "normal"
    meta: Dict[str, Any] = Field(default_factory=dict)
