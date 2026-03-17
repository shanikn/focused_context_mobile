import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agents.ingestion import embed_text, ingest_note, collection  # noqa: E402
from notepad import Note  # noqa: E402


def test_embed_text():
    result = embed_text("Buy milk")
    # the length of every output for the all-MiniLM-L6-v2 model I use
    assert len(result) == 384


def test_ingest_note_in_chromaDB():
    note = Note(content="Walk the dog")
    ingest_note(note)
    results = collection.get(ids=[note.id])
    assert note.id in results["ids"]
    collection.delete(ids=[note.id])
