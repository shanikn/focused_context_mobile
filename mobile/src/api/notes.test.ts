import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest } from "./client";
import { deleteNote, getNotes } from "./notes";
import { readAlertNotes } from "../services/alertNotesCache";

jest.mock("./client", () => ({ apiRequest: jest.fn(), currentUserId: () => "uid-a" }));

const request = apiRequest as jest.Mock;
const NOTE = {
  _id: "n1",
  content: "water the plants",
  category: "todo",
  contexts: ["id-home"],
  list_name: "General",
  reminders_enabled: true,
  never_show: false,
  cooldown_until: null,
  remind_on_date: null,
  useful_count: 0,
  dismissed_count: 0,
};

beforeEach(async () => {
  request.mockReset();
  await AsyncStorage.clear();
});

test("every successful load refreshes the offline alert cache for the signed-in user", async () => {
  request.mockResolvedValue([NOTE]);
  expect(await getNotes()).toEqual([NOTE]);
  expect((await readAlertNotes("uid-a")).map((n) => n._id)).toEqual(["n1"]);
});

test("a failed load leaves the cache as it was", async () => {
  request.mockResolvedValueOnce([NOTE]);
  await getNotes();
  request.mockRejectedValueOnce(new TypeError("Network request failed"));
  await expect(getNotes()).rejects.toThrow("Network request failed");
  expect((await readAlertNotes("uid-a")).map((n) => n._id)).toEqual(["n1"]);
});

test("deleting a note removes it from the cache", async () => {
  request.mockResolvedValueOnce([NOTE]);
  await getNotes();
  request.mockResolvedValueOnce({ message: "note deleted" });
  await deleteNote("n1");
  expect(await readAlertNotes("uid-a")).toEqual([]);
});
