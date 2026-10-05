from fastapi.testclient import TestClient

from agents.categorizer import STORE_TYPES, categorize, infer_store_type
from agents.pipeline import store_type
from api.main import app
from notepad import Note
from tests.support import delete_any  # noqa: E402

client = TestClient(app)


def test_store_types():
    assert STORE_TYPES == ("supermarket", "pharmacy", "post_office")


def test_food_and_groceries_go_to_the_supermarket():
    assert infer_store_type("buy milk") == "supermarket"
    assert infer_store_type("get carrots and bread") == "supermarket"
    assert infer_store_type("groceries for the weekend") == "supermarket"


def test_medicine_goes_to_the_pharmacy():
    assert infer_store_type("buy medicine for the flu") == "pharmacy"
    assert infer_store_type("get pills") == "pharmacy"
    assert infer_store_type("grab vitamins") == "pharmacy"
    assert infer_store_type("pick up my prescription") == "pharmacy"


def test_packages_and_mail_go_to_the_post_office():
    assert infer_store_type("pick up the package") == "post_office"
    assert infer_store_type("send the parcel to grandma") == "post_office"
    assert infer_store_type("buy stamps and send mail") == "post_office"
    assert infer_store_type("go to the post office") == "post_office"


def test_default_is_the_supermarket():
    assert infer_store_type("buy a birthday present") == "supermarket"


def test_store_errands_are_errands():
    assert categorize("send the parcel to grandma") == "errand"
    assert categorize("go to the pharmacy") == "errand"
    assert categorize("pick up my prescription") == "errand"


def test_only_errands_have_a_store_type():
    assert store_type(Note(content="buy medicine", category="errand")) == "pharmacy"
    assert store_type(Note(content="buy milk", category="errand")) == "supermarket"
    assert store_type(Note(content="call mom about the medicine", category="todo")) is None
    assert store_type(Note(content="idea: a mail app", category="idea")) is None


def test_list_notes_reports_the_store_type():
    errand = client.post("/notes/", json={"content": "buy vitamins"}).json()["id"]
    todo = client.post("/notes/", json={"content": "call mom"}).json()["id"]
    by_id = {n["_id"]: n for n in client.get("/notes/").json()}
    delete_any(errand)
    delete_any(todo)
    assert by_id[errand]["category"] == "errand"
    assert by_id[errand]["store_type"] == "pharmacy"
    assert by_id[todo]["store_type"] is None
