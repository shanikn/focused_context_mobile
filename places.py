from dataclasses import dataclass, field
from typing import Optional
from uuid import uuid4
import logging

from notepad import db

logger = logging.getLogger(__name__)

# User places (names + optional keywords only; coordinates stay on the phone).
# Notes are tagged with a place's id, so renaming a place never breaks them.
places_collection = db["places"]

# every user starts with these; "kind" links them to the built-in keywords
DEFAULT_PLACES = [("home", "Home"), ("uni", "Uni"), ("work", "Work")]


@dataclass
class Place:
    id: str
    user_id: Optional[str]
    name: str
    keywords: list = field(default_factory=list)
    kind: Optional[str] = None  # "home" | "uni" | "work" for defaults, else None
    order: int = 0


def ensure_place_indexes():
    """Idempotent: places are always looked up by owner."""
    places_collection.create_index("user_id")


def place_to_dict(place: Place) -> dict:
    """API shape: no user_id, no coordinates."""
    return {
        "id": place.id,
        "name": place.name,
        "keywords": place.keywords,
        "kind": place.kind,
    }


def _from_doc(d: dict) -> Place:
    return Place(
        id=d["_id"],
        user_id=d.get("user_id"),
        name=d["name"],
        keywords=d.get("keywords", []),
        kind=d.get("kind"),
        order=d.get("order", 0),
    )


def _seed_defaults(user_id: Optional[str]):
    # upsert by (user, kind) so concurrent first requests can't duplicate
    for order, (kind, name) in enumerate(DEFAULT_PLACES):
        places_collection.update_one(
            {"user_id": user_id, "kind": kind},
            {"$setOnInsert": {
                "_id": str(uuid4()), "user_id": user_id, "name": name,
                "keywords": [], "kind": kind, "order": order,
            }},
            upsert=True,
        )


def get_places(user_id: Optional[str]) -> list[Place]:
    """The user's places, defaults first, then custom ones in creation order."""
    if places_collection.count_documents({"user_id": user_id, "kind": {"$ne": None}}) < len(DEFAULT_PLACES):
        _seed_defaults(user_id)
    docs = places_collection.find({"user_id": user_id}).sort("order", 1)
    return [_from_doc(d) for d in docs]


def _clean_keywords(keywords) -> list:
    return [k.strip().lower() for k in (keywords or []) if k and k.strip()]


def _name_taken(user_id, name, exclude_id=None) -> bool:
    return any(
        p.name.lower() == name.lower() and p.id != exclude_id
        for p in get_places(user_id)
    )


def create_place(user_id: Optional[str], name: str, keywords=None) -> Place:
    name = name.strip()
    if not name:
        raise ValueError("place name is empty")
    if _name_taken(user_id, name):
        raise ValueError(f'a place named "{name}" already exists')
    last = places_collection.find_one({"user_id": user_id}, sort=[("order", -1)])
    place = Place(
        id=str(uuid4()), user_id=user_id, name=name,
        keywords=_clean_keywords(keywords),
        order=(last["order"] + 1) if last else len(DEFAULT_PLACES),
    )
    places_collection.insert_one({
        "_id": place.id, "user_id": user_id, "name": place.name,
        "keywords": place.keywords, "kind": None, "order": place.order,
    })
    return place


def update_place(user_id: Optional[str], place_id: str, name: Optional[str] = None, keywords=None) -> bool:
    fields = {}
    if name is not None:
        name = name.strip()
        if not name:
            raise ValueError("place name is empty")
        if _name_taken(user_id, name, exclude_id=place_id):
            raise ValueError(f'a place named "{name}" already exists')
        fields["name"] = name
    if keywords is not None:
        fields["keywords"] = _clean_keywords(keywords)
    if not fields:
        return places_collection.count_documents({"_id": place_id, "user_id": user_id}) > 0
    result = places_collection.update_one({"_id": place_id, "user_id": user_id}, {"$set": fields})
    return result.matched_count > 0


def delete_place(user_id: Optional[str], place_id: str) -> bool:
    return places_collection.delete_one({"_id": place_id, "user_id": user_id}).deleted_count > 0


def resolve_place(user_id: Optional[str], location: Optional[str]) -> Optional[Place]:
    """Find the user's place by id or by name (case-insensitive)."""
    if not location:
        return None
    places = get_places(user_id)
    for p in places:
        if p.id == location:
            return p
    for p in places:
        if p.name.lower() == location.strip().lower():
            return p
    return None
