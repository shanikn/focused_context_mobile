from sentence_transformers import SentenceTransformer
import chromadb
import os
import sys
import logging

logger = logging.getLogger(__name__)

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from notepad import Note  # noqa: E402

# Ingestion: embed a note and store it in ChromaDB
# so the system can answer "what notes are relevant to the current context?"

# model setup
model = SentenceTransformer('all-MiniLM-L6-v2')

# chromadb setup
chroma_path = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "chroma_db")
)
os.makedirs(chroma_path, exist_ok=True)
chroma_client = chromadb.PersistentClient(path=chroma_path)
collection = chroma_client.get_or_create_collection(name="notes")


def embed_text(text: str) -> list:
    embedding = model.encode(text)
    return embedding.tolist()


def ingest_note(note: Note):
    text = note.content
    embed = embed_text(text)
    collection.upsert(
        ids=[note.id],
        embeddings=[embed],
        metadatas=[{
            "category": note.category,
            "created_at": str(note.created_at),
        }],
    )


if __name__ == "__main__":
    note = Note(content="Buy milk")
    ingest_note(note)
    logger.info("Ingested successfully")

    results = collection.query(
        query_embeddings=[embed_text("grocery shopping")],
        n_results=1,
    )
    logger.debug(results)
