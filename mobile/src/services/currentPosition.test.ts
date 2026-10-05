import * as Location from "expo-location";
import { FIX_TIMEOUT_MS, freshFix, quickFix, recentFix } from "./currentPosition";

jest.mock("expo-location", () => ({
  getLastKnownPositionAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));

const lastKnown = Location.getLastKnownPositionAsync as jest.Mock;
const current = Location.getCurrentPositionAsync as jest.Mock;
const NOW = 1_000_000_000;
const pos = (accuracy: number | null, ageMs: number, lat = 32.1) => ({
  coords: { latitude: lat, longitude: 34.8, accuracy },
  timestamp: NOW - ageMs,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Date, "now").mockReturnValue(NOW);
});
afterEach(() => {
  jest.useRealTimers();
  (Date.now as jest.Mock).mockRestore?.();
});

describe("recentFix: the phone's last known position, instantly", () => {
  test("recent (< 2 min) and accurate (< 100 m): used", async () => {
    lastKnown.mockResolvedValue(pos(30, 60_000));
    expect(await recentFix()).toEqual({ latitude: 32.1, longitude: 34.8, accuracy: 30, timestamp: NOW - 60_000 });
    expect(lastKnown).toHaveBeenCalledWith({ maxAge: 120_000, requiredAccuracy: 100 });
  });

  test("too old, too rough, missing or failing: none", async () => {
    lastKnown.mockResolvedValueOnce(pos(30, 3 * 60_000));
    expect(await recentFix()).toBeNull();
    lastKnown.mockResolvedValueOnce(pos(300, 1000));
    expect(await recentFix()).toBeNull();
    lastKnown.mockResolvedValueOnce(pos(null, 1000));
    expect(await recentFix()).toBeNull();
    lastKnown.mockResolvedValueOnce(null);
    expect(await recentFix()).toBeNull();
    lastKnown.mockRejectedValueOnce(new Error("off"));
    expect(await recentFix()).toBeNull();
  });

  test("looser limits when asked", async () => {
    lastKnown.mockResolvedValue(pos(400, 5 * 60_000));
    expect(await recentFix({ maxAgeMs: 10 * 60_000, maxAccuracyM: 500 })).not.toBeNull();
  });
});

describe("freshFix: a new fix at Balanced accuracy, with a timeout", () => {
  test("returns the fix", async () => {
    current.mockResolvedValue(pos(20, 0, 32.2));
    expect((await freshFix())?.latitude).toBe(32.2);
    expect(current).toHaveBeenCalledWith({ accuracy: Location.Accuracy.Balanced });
  });

  test("gives up after about 10 seconds", async () => {
    jest.useFakeTimers();
    current.mockReturnValue(new Promise(() => {}));
    const result = freshFix();
    jest.advanceTimersByTime(FIX_TIMEOUT_MS);
    expect(await result).toBeNull();
    expect(FIX_TIMEOUT_MS).toBe(10_000);
  });

  test("an error is no fix", async () => {
    current.mockRejectedValue(new Error("location off"));
    expect(await freshFix()).toBeNull();
  });
});

test("quickFix: the recent one if there is one, else a fresh one", async () => {
  lastKnown.mockResolvedValueOnce(pos(30, 1000, 32.3));
  expect((await quickFix())?.latitude).toBe(32.3);
  expect(current).not.toHaveBeenCalled();
  lastKnown.mockResolvedValueOnce(null);
  current.mockResolvedValueOnce(pos(20, 0, 32.4));
  expect((await quickFix())?.latitude).toBe(32.4);
});
