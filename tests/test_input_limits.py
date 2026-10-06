"""Input size limits: note text 5000 characters (create and edit, JSON and
query), address search 200 characters."""
import pytest
from fastapi.testclient import TestClient

import api.main as main

client = TestClient(main.app)
TOKENS = {"Bearer token-a": "lim-user-a"}
AS_A = {"Authorization": "Bearer token-a"}


@pytest.fixture
def signed_in(monkeypatch):
    monkeypatch.setattr(main, "get_user_id", lambda authorization: TOKENS.get(authorization))
    # no database or AI work: only the validation is under test
    monkeypatch.setattr(main, "save_note", lambda note: None)
    monkeypatch.setattr(main, "enrich_note", lambda note: None)
    monkeypatch.setattr(main, "update_note", lambda *a, **k: 1)
    monkeypatch.setattr(main, "get_note_by_id", lambda *a, **k: None)
    monkeypatch.setattr(main.geocode, "search", lambda q, lat=None, lon=None: [])


def test_note_text_up_to_5000_characters(signed_in):
    assert client.post("/notes/", json={"content": "x" * 5000}, headers=AS_A).status_code == 200
    assert client.post("/notes/", json={"content": "x" * 5001}, headers=AS_A).status_code == 422


def test_edit_json_body_up_to_5000_characters(signed_in):
    assert client.put("/notes/n1", json={"content": "x" * 5000}, headers=AS_A).status_code == 200
    assert client.put("/notes/n1", json={"content": "x" * 5001}, headers=AS_A).status_code == 422


def test_edit_query_parameter_up_to_5000_characters(signed_in):
    assert client.put("/notes/n1", params={"content": "x" * 5000}, headers=AS_A).status_code == 200
    assert client.put("/notes/n1", params={"content": "x" * 5001}, headers=AS_A).status_code == 422


def test_search_up_to_200_characters(signed_in):
    assert client.get("/places/search", params={"q": "x" * 200}, headers=AS_A).status_code == 200
    assert client.get("/places/search", params={"q": "x" * 201}, headers=AS_A).status_code == 422
