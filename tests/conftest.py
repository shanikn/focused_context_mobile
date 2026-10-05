import os
import shutil

# Point tests at their own MongoDB database and ChromaDB folder so they never
# read or write the real "contextmind" data. This runs before any test module
# imports notepad/agents, and load_dotenv() won't override these values.
TEST_CHROMA_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "chroma_db_test"
)
os.environ["MONGO_DB_NAME"] = "contextmind_test"
os.environ["CHROMA_PATH"] = TEST_CHROMA_PATH
# never call the real Google Places API from tests: an empty key means "no
# key", and load_dotenv() won't replace a variable that's already set
os.environ["GOOGLE_MAPS_API_KEY"] = ""
# the suite makes many requests as one user; test_rate_limits.py turns them on
os.environ["RATE_LIMITS"] = "off"

# start every run from empty test stores, so leftovers from a crashed run
# can't pollute relevance results
shutil.rmtree(TEST_CHROMA_PATH, ignore_errors=True)

from notepad import MONGO_DB_NAME, notes_collection  # noqa: E402
from places import places_collection  # noqa: E402

assert MONGO_DB_NAME == "contextmind_test"
notes_collection.delete_many({})
places_collection.delete_many({})
