from notepad import Note
from agents.pipeline import process_new_notes, get_reminders, full_delete


# helper functions
def process_multiple_notes(*notes):
    for note in notes:
        process_new_notes(note)


def delete_multiple_notes(*notes):
    for note in notes:
        full_delete(note.id)


def simulation(notes: list, query: str, location, hour: int):
    process_multiple_notes(*notes)
    # gets a list of the 3 top ranked notes in context of the input note
    similar = get_reminders(query, location, hour)
    contents = [x.content for x in similar]
    print(contents)
    delete_multiple_notes(*notes)


if __name__ == "__main__":
    errand_notes = [
        Note(content="walk Libby"),
        Note(content="buy groceries"),
        Note(content="pick up medicine from the pharmacy"),
        Note(content="go shopping for clothes"),
        Note(content="buy a birthday gift"),

        # extra notes for testing
        Note(content="study for the upcoming exam"),
        Note(content="finish your homework in Intro to Probabilty"),
        Note(content="send email to boss"),
    ]
    simulation(errand_notes, "outside", "errands", 9)

    uni_notes = [
        Note(content="study for the upcoming exam"),
        Note(content="go to class"),
        Note(content="finish your homework in Intro to Probabilty"),
        Note(content="prepare for the lecture"),
        Note(content="submit assignment before deadline"),

        # extra notes for testing
        Note(content="walk Libby"),
        Note(content="buy groceries"),
        Note(content="send email to boss"),
    ]
    simulation(uni_notes, "study", "uni", 9)
