"""Folders are kept per user on the server and stay until the user deletes
them; deleting one moves its notes to General."""
import pytest
from fastapi.testclient import TestClient

import api.main as main
import folders
from notepad import notes_collection
from tests.support import note_doc

client = TestClient(main.app)
A, B = "fold-user-a", "fold-user-b"
TOKENS = {"Bearer token-a": A, "Bearer token-b": B}
AS_A = {"Authorization": "Bearer token-a"}
AS_B = {"Authorization": "Bearer token-b"}


@pytest.fixture(autouse=True)
def two_users(monkeypatch):
    monkeypatch.setattr(main, "get_user_id", lambda authorization: TOKENS.get(authorization))
    # no AI work: folders are what's under test
    monkeypatch.setattr(main, "enrich_note", lambda note: None)
    yield
    for uid in (A, B):
        notes_collection.delete_many({"user_id": uid})
        folders.folders_collection.delete_many({"user_id": uid})


def _names(headers=AS_A):
    res = client.get("/folders/", headers=headers)
    assert res.status_code == 200
    return [f["name"] for f in res.json()]


def _note(content, folder, headers=AS_A):
    return client.post("/notes/", json={"content": content, "list_name": folder}, headers=headers).json()["id"]


def test_a_created_folder_is_listed_even_when_empty():
    assert client.post("/folders/", json={"name": "Games"}, headers=AS_A).status_code == 200
    assert _names() == ["Games"]


def test_moving_the_only_note_out_keeps_the_folder():
    note_id = _note("play chess", "Games")
    assert "Games" in _names()
    client.put(f"/notes/{note_id}", json={"list_name": "General"}, headers=AS_A)
    assert note_doc(note_id)["list_name"] == "General"
    assert "Games" in _names()


def test_folders_only_used_by_notes_are_kept_from_now_on():
    # notes saved before folders were stored (older app, another device)
    notes_collection.insert_one({"_id": "fold-old", "content": "x", "list_name": "Trips", "user_id": A, "contexts": []})
    assert "Trips" in _names()  # listed, and now stored
    notes_collection.delete_one({"_id": "fold-old"})
    assert "Trips" in _names()


def test_sorted_and_general_is_never_stored():
    for name in ("Work", "Games", "art"):
        client.post("/folders/", json={"name": name}, headers=AS_A)
    _note("x", "General")
    assert _names() == ["art", "Games", "Work"]


@pytest.mark.parametrize("name", ["", "   ", "General", "general", "All", "x" * 51])
def test_bad_names_are_422(name):
    assert client.post("/folders/", json={"name": name}, headers=AS_A).status_code == 422


def test_names_are_trimmed_and_duplicates_are_409():
    assert client.post("/folders/", json={"name": "  Games "}, headers=AS_A).json() == {"name": "Games"}
    res = client.post("/folders/", json={"name": "games"}, headers=AS_A)
    assert res.status_code == 409


def test_delete_an_empty_folder():
    client.post("/folders/", json={"name": "Games"}, headers=AS_A)
    res = client.delete("/folders/Games", headers=AS_A)
    assert res.status_code == 200
    assert res.json() == {"deleted": True, "moved": 0}
    assert _names() == []


def test_delete_a_folder_moves_its_notes_to_general():
    a1 = _note("play chess", "Games")
    a2 = _note("buy a board", "Games")
    other = _note("call mom", "Family")
    res = client.delete("/folders/Games", headers=AS_A)
    assert res.json() == {"deleted": True, "moved": 2}
    assert note_doc(a1)["list_name"] == "General"
    assert note_doc(a2)["list_name"] == "General"
    assert note_doc(other)["list_name"] == "Family"
    assert "Games" not in _names()


def test_delete_a_folder_name_with_spaces_and_hebrew():
    client.post("/folders/", json={"name": "משחקים לילדים"}, headers=AS_A)
    assert client.delete("/folders/משחקים לילדים", headers=AS_A).json()["deleted"] is True


def test_deleting_twice_is_safe():
    client.post("/folders/", json={"name": "Games"}, headers=AS_A)
    client.delete("/folders/Games", headers=AS_A)
    assert client.delete("/folders/Games", headers=AS_A).json() == {"deleted": False, "moved": 0}


def test_each_user_has_their_own_folders():
    client.post("/folders/", json={"name": "Games"}, headers=AS_A)
    b_note = _note("b's note", "Games", headers=AS_B)
    assert _names(AS_B) == ["Games"]  # B's own, from B's note
    client.delete("/folders/Games", headers=AS_A)
    assert note_doc(b_note)["list_name"] == "Games"  # A deleting theirs didn't touch B
    assert _names(AS_B) == ["Games"]


def test_account_deletion_removes_folders():
    from agents.pipeline import delete_user_data
    client.post("/folders/", json={"name": "Games"}, headers=AS_A)
    assert delete_user_data(A)["folders"] == 1
    assert folders.folders_collection.count_documents({"user_id": A}) == 0


def test_requires_sign_in():
    assert client.get("/folders/").status_code == 401
    assert client.post("/folders/", json={"name": "x"}).status_code == 401
    assert client.delete("/folders/x").status_code == 401
