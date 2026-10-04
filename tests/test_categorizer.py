import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agents.categorizer import categorize, infer_time, infer_place  # noqa: E402,E501
from places import Place  # noqa: E402

PLACES = [
    Place(id="p-home", user_id=None, name="Home", kind="home"),
    Place(id="p-uni", user_id=None, name="Uni", kind="uni"),
    Place(id="p-work", user_id=None, name="Work", kind="work"),
    Place(id="p-gym", user_id=None, name="Gym"),
    Place(id="p-pharmacy", user_id=None, name="Pharmacy", keywords=["medicine"]),
]


def _place_id(content):
    place = infer_place(content, PLACES)
    return place.id if place else None


def test_task():
    assert categorize("I need to do my homework") == "task"


def test_errand():
    assert categorize("Buy milk from the store") == "errand"


def test_idea():
    assert categorize("Random idea for a app") == "idea"


def test_reminder():
    assert categorize("Remember to call mom") == "reminder"


def test_scheduled():
    assert categorize("Dentist appointment at 3pm") == "scheduled"


def test_uncategorized():
    assert categorize("blah blah blah") == "uncategorized"


# infer_time tests
def test_infer_time_24h():
    assert infer_time("call dentist at 14:00") == "14:00"


def test_infer_time_24h_minutes():
    assert infer_time("call dentist at 14:30") == "14:30"


def test_infer_time_pm():
    assert infer_time("meeting at 3pm") == "15:00"


def test_infer_time_am():
    assert infer_time("wake up at 7am") == "07:00"


def test_infer_time_12pm():
    assert infer_time("lunch at 12pm") == "12:00"


def test_infer_time_12am():
    assert infer_time("midnight snack at 12am") == "00:00"


def test_infer_time_morning():
    assert infer_time("go for a run in the morning") == "09:00"


def test_infer_time_evening():
    assert infer_time("call mom in the evening") == "18:00"


def test_infer_time_night():
    assert infer_time("take meds at night") == "20:00"


def test_infer_time_none():
    assert infer_time("buy milk") is None


# infer_place tests: notes are tagged with the matching place's id
def test_infer_place_home():
    assert _place_id("do the laundry") == "p-home"


def test_infer_place_uni():
    assert _place_id("study for exam") == "p-uni"


def test_infer_place_work():
    assert _place_id("prepare presentation for client") == "p-work"


def test_infer_place_custom_by_name():
    assert _place_id("go to the gym") == "p-gym"


def test_infer_place_custom_by_keyword():
    assert _place_id("buy medicine for the flu") == "p-pharmacy"


def test_infer_place_custom_by_meaning():
    assert _place_id("refill my prescription") == "p-pharmacy"
    assert _place_id("leg day workout") == "p-gym"


def test_errands_no_longer_a_location():
    assert _place_id("buy milk") is None


def test_infer_place_none():
    assert _place_id("blah blah blah") is None
    assert _place_id("call mom") is None


def test_infer_place_without_places():
    assert infer_place("do the laundry", []) is None


# absolute dates written in the note
def test_infer_date_day_of_month():
    from datetime import datetime
    from agents.categorizer import infer_date
    now = datetime(2026, 10, 4, 13, 0)
    note = "get 20 minutes early to the exam on the 9th of October"
    assert infer_date(note, now) == "2026-10-09"
    assert infer_date("dentist October 9th", now) == "2026-10-09"
    assert infer_date("dentist oct 9, 2027", now) == "2027-10-09"
    assert infer_date("party 9/10", now) == "2026-10-09"


def test_infer_date_past_day_rolls_to_next_year():
    from datetime import datetime
    from agents.categorizer import infer_date
    now = datetime(2026, 10, 4, 13, 0)
    assert infer_date("birthday 3 March", now) == "2027-03-03"


def test_infer_date_ignores_impossible_dates():
    from datetime import datetime
    from agents.categorizer import infer_date
    now = datetime(2026, 10, 4, 13, 0)
    assert infer_date("31st of February", now) is None
    assert infer_date("mix 1/2 cup", now) == "2027-02-01"  # day/month, by design
    assert infer_date("may I borrow it", now) is None


def test_note_with_a_date_is_scheduled():
    note = "get 20 minutes early to the exam on the 9th of October"
    assert categorize(note) == "scheduled"
    assert _place_id(note) == "p-uni"
