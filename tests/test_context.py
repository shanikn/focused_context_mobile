import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from agents.context import (  # noqa: E402
    get_time_bucket, get_location_bucket, get_context
)
from places import Place  # noqa: E402


# time tests
def test_morning():
    assert get_time_bucket(9) == "morning"


def test_noon():
    assert get_time_bucket(13) == "noon"


def test_afternoon():
    assert get_time_bucket(16) == "afternoon"


def test_evening():
    assert get_time_bucket(18) == "evening"


def test_night():
    assert get_time_bucket(1) == "night"


# location tests
PLACES = [
    Place(id="p-home", user_id=None, name="Home", kind="home"),
    Place(id="p-gym", user_id=None, name="Gym"),
]


def test_location_by_name_gives_place_id():
    assert get_location_bucket("home", PLACES) == "p-home"
    assert get_location_bucket("GYM", PLACES) == "p-gym"


def test_location_by_id():
    assert get_location_bucket("p-gym", PLACES) == "p-gym"


def test_invalid_location():
    assert get_location_bucket("Jupyter", PLACES) == "unknown"
    assert get_location_bucket("errands", PLACES) == "unknown"
    assert get_location_bucket("unknown", PLACES) == "unknown"


# combination test
def test_context():
    assert get_context("home", 9, PLACES) == "Home + morning"
    assert get_context("Jupyter", 9, PLACES) == "unknown + morning"
