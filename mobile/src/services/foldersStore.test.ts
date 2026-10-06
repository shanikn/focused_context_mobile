import AsyncStorage from "@react-native-async-storage/async-storage";
import { ApiError } from "../api/client";
import { createFolder, deleteFolder, listFolders } from "../api/folders";
import { addFolder, FOLDERS_CACHE_KEY, loadFolders, removeFolder } from "./foldersStore";

jest.mock("../api/folders", () => ({
  listFolders: jest.fn(),
  createFolder: jest.fn(),
  deleteFolder: jest.fn(),
}));

const LEGACY_KEY = "focusedcontext.customLists";
const list = listFolders as jest.Mock;
const create = createFolder as jest.Mock;
const remove = deleteFolder as jest.Mock;

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  list.mockResolvedValue(["Games", "Work"]);
  create.mockImplementation(async (name: string) => name);
  remove.mockResolvedValue({ deleted: true, moved: 0 });
});

test("kept under focusedcontext.*", () => {
  expect(FOLDERS_CACHE_KEY).toBe("focusedcontext.folders");
});

test("the server's folders, also saved for offline", async () => {
  expect(await loadFolders()).toEqual(["Games", "Work"]);
  expect(JSON.parse((await AsyncStorage.getItem(FOLDERS_CACHE_KEY)) as string)).toEqual(["Games", "Work"]);
});

test("folders kept only on this phone before are uploaded once, then the old list is dropped", async () => {
  await AsyncStorage.setItem(LEGACY_KEY, JSON.stringify(["Trips", "games"]));
  expect(await loadFolders()).toEqual(["Games", "Trips", "Work"]);
  expect(create.mock.calls).toEqual([["Trips"]]); // "games" is already on the server as "Games"
  expect(await AsyncStorage.getItem(LEGACY_KEY)).toBeNull();
  create.mockClear();
  await loadFolders();
  expect(create).not.toHaveBeenCalled();
});

test("an upload that fails keeps the old list for next time", async () => {
  await AsyncStorage.setItem(LEGACY_KEY, JSON.stringify(["Trips"]));
  create.mockRejectedValueOnce(new TypeError("Network request failed"));
  expect(await loadFolders()).toEqual(["Games", "Trips", "Work"]);
  expect(await AsyncStorage.getItem(LEGACY_KEY)).not.toBeNull();
});

test("a folder that already exists on the server (409) counts as uploaded", async () => {
  await AsyncStorage.setItem(LEGACY_KEY, JSON.stringify(["Trips"]));
  create.mockRejectedValueOnce(new ApiError(409, '{"detail":"exists"}'));
  await loadFolders();
  expect(await AsyncStorage.getItem(LEGACY_KEY)).toBeNull();
});

test("offline: the saved folders (and any old phone ones)", async () => {
  await loadFolders();
  await AsyncStorage.setItem(LEGACY_KEY, JSON.stringify(["Trips"]));
  list.mockRejectedValue(new TypeError("Network request failed"));
  expect(await loadFolders()).toEqual(["Games", "Trips", "Work"]);
});

test("adding and removing update the saved list", async () => {
  await loadFolders();
  expect(await addFolder(" Art ")).toEqual(["Art", "Games", "Work"]);
  expect(create).toHaveBeenCalledWith("Art");
  remove.mockResolvedValueOnce({ deleted: true, moved: 3 });
  expect(await removeFolder("Games")).toEqual({ folders: ["Art", "Work"], moved: 3 });
  expect(remove).toHaveBeenCalledWith("Games");
  expect(JSON.parse((await AsyncStorage.getItem(FOLDERS_CACHE_KEY)) as string)).toEqual(["Art", "Work"]);
});
