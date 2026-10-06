import { AppState } from "react-native";
import { deleteNote } from "../api/notes";
import { syncScheduledReminders } from "./scheduledReminders";
import { syncStoreAlerts } from "./storeAlerts";
import { Note } from "../types/notes";
import {
  UNDO_MS,
  deleteWithUndo,
  finishPendingDelete,
  hiddenNoteIds,
  pendingNote,
  subscribe,
  undoDelete,
} from "./pendingDelete";

jest.mock("../api/notes", () => ({ deleteNote: jest.fn() }));
jest.mock("./scheduledReminders", () => ({ syncScheduledReminders: jest.fn() }));
jest.mock("./storeAlerts", () => ({ syncStoreAlerts: jest.fn() }));

const note = (id: string) => ({ _id: id, content: `note ${id}` }) as unknown as Note;
const mockDelete = deleteNote as jest.Mock;

// the app-state handler registered while a delete is waiting
let appStateHandler: ((state: string) => void) | null = null;
const removeAppState = jest.fn();

beforeEach(async () => {
  jest.useFakeTimers();
  await finishPendingDelete();
  jest.clearAllMocks();
  mockDelete.mockResolvedValue({ message: "ok" });
  appStateHandler = null;
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, handler) => {
    appStateHandler = handler as (state: string) => void;
    return { remove: removeAppState } as never;
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// let the server call's promise settle
async function settle() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

test("the note is hidden right away; the server delete waits 5 seconds", async () => {
  deleteWithUndo(note("a"));
  expect(pendingNote()?._id).toBe("a");
  expect(hiddenNoteIds()).toEqual(["a"]);
  jest.advanceTimersByTime(UNDO_MS - 1);
  expect(mockDelete).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(mockDelete).toHaveBeenCalledWith("a");
  await settle();
  expect(pendingNote()).toBeNull();
  expect(hiddenNoteIds()).toEqual([]);
  expect(syncScheduledReminders).toHaveBeenCalled();
  expect(syncStoreAlerts).toHaveBeenCalled();
});

test("5 seconds is the undo window", () => {
  expect(UNDO_MS).toBe(5000);
});

test("Undo within 5 seconds: never deleted on the server", async () => {
  deleteWithUndo(note("a"));
  jest.advanceTimersByTime(3000);
  expect(undoDelete()?._id).toBe("a");
  expect(pendingNote()).toBeNull();
  expect(hiddenNoteIds()).toEqual([]);
  jest.advanceTimersByTime(UNDO_MS * 2);
  await settle();
  expect(mockDelete).not.toHaveBeenCalled();
});

test("Undo with nothing waiting does nothing", () => {
  expect(undoDelete()).toBeNull();
});

test("deleting another note finishes the waiting delete first", async () => {
  deleteWithUndo(note("a"));
  deleteWithUndo(note("b"));
  expect(mockDelete).toHaveBeenCalledTimes(1);
  expect(mockDelete).toHaveBeenCalledWith("a");
  // a stays hidden while its delete is on the way; b waits for its own 5 seconds
  expect(pendingNote()?._id).toBe("b");
  expect(hiddenNoteIds().sort()).toEqual(["a", "b"]);
  await settle();
  expect(hiddenNoteIds()).toEqual(["b"]);
  expect(undoDelete()?._id).toBe("b");
  jest.advanceTimersByTime(UNDO_MS);
  await settle();
  expect(mockDelete).toHaveBeenCalledTimes(1);
});

test("going to the background finishes the waiting delete", async () => {
  deleteWithUndo(note("a"));
  expect(appStateHandler).not.toBeNull();
  appStateHandler!("active");
  expect(mockDelete).not.toHaveBeenCalled();
  appStateHandler!("background");
  expect(mockDelete).toHaveBeenCalledWith("a");
  expect(removeAppState).toHaveBeenCalled();
  jest.advanceTimersByTime(UNDO_MS);
  await settle();
  expect(mockDelete).toHaveBeenCalledTimes(1);
});

test("the app-state watch stops after Undo", () => {
  deleteWithUndo(note("a"));
  undoDelete();
  expect(removeAppState).toHaveBeenCalled();
});

test("listeners hear about each change, the deletion and a failure", async () => {
  const heard: unknown[] = [];
  const stop = subscribe((outcome) => heard.push(outcome ?? "changed"));
  deleteWithUndo(note("a"));
  jest.advanceTimersByTime(UNDO_MS);
  await settle();
  expect(heard).toContainEqual({ kind: "deleted", id: "a" });

  heard.length = 0;
  mockDelete.mockRejectedValueOnce(new TypeError("Network request failed"));
  deleteWithUndo(note("b"));
  await finishPendingDelete();
  expect(heard).toContainEqual({ kind: "failed", note: note("b") });
  // a failed delete shows the note again
  expect(hiddenNoteIds()).toEqual([]);

  stop();
  heard.length = 0;
  deleteWithUndo(note("c"));
  expect(heard).toEqual([]);
});
