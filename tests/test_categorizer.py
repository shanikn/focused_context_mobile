import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agents.categorizer import categorize, infer_time, infer_location  # noqa: E402,E501


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


# infer_location tests
def test_infer_location_home():
    assert infer_location("do the laundry", "task") == "home"


def test_infer_location_uni():
    assert infer_location("study for exam", "task") == "uni"


def test_infer_location_work():
    assert infer_location("prepare presentation for client", "task") == "work"


def test_infer_location_errands():
    assert infer_location("buy milk", "errand") == "errands"


def test_infer_location_none():
    assert infer_location("blah blah blah", "uncategorized") == ""
