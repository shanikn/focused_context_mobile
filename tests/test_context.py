import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from agents.context import (  # noqa: E402
    get_time_bucket, get_location_bucket, get_context
)


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
def test_valid_location():
    assert get_location_bucket("home") == "home"


def test_invalid_location():
    assert get_location_bucket("Jupyter") == "unknown"


# combination test
def test_context():
    assert get_context("home", 9) == "home + morning"
