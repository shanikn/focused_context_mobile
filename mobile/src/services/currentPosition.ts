import * as Location from "expo-location";

// Where the phone is, quickly. getCurrentPositionAsync always waits for a new
// fix (on an S8 indoors that can take many seconds, or never finish), so we
// first take the position the phone already knows if it's recent and
// accurate enough, and only ask for a new fix (Balanced: Wi-Fi/cell, GPS if
// needed) with a timeout.

export const QUICK_MAX_AGE_MS = 2 * 60 * 1000;
export const QUICK_MAX_ACCURACY_M = 100;
export const FIX_TIMEOUT_MS = 10_000;

export interface Fix {
  latitude: number;
  longitude: number;
  accuracy: number | null; // meters
  timestamp: number;
}

function toFix(p: Location.LocationObject): Fix {
  return {
    latitude: p.coords.latitude,
    longitude: p.coords.longitude,
    accuracy: p.coords.accuracy ?? null,
    timestamp: p.timestamp,
  };
}

// the phone's last known position, if recent and accurate enough; instant
export async function recentFix(
  opts: { maxAgeMs?: number; maxAccuracyM?: number } = {}
): Promise<Fix | null> {
  const maxAgeMs = opts.maxAgeMs ?? QUICK_MAX_AGE_MS;
  const maxAccuracyM = opts.maxAccuracyM ?? QUICK_MAX_ACCURACY_M;
  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: maxAgeMs, requiredAccuracy: maxAccuracyM });
    if (!last) {
      return null;
    }
    // checked here too: the native options are only hints on some phones
    const fix = toFix(last);
    const fresh = Date.now() - fix.timestamp < maxAgeMs;
    const accurate = fix.accuracy !== null && fix.accuracy < maxAccuracyM;
    return fresh && accurate ? fix : null;
  } catch {
    return null;
  }
}

// a new fix at Balanced accuracy, or null after the timeout or an error
export async function freshFix(timeoutMs: number = FIX_TIMEOUT_MS): Promise<Fix | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    const fix = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      .then(toFix)
      .catch(() => null);
    return await Promise.race([fix, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function quickFix(opts: { maxAgeMs?: number; maxAccuracyM?: number } = {}): Promise<Fix | null> {
  return (await recentFix(opts)) ?? (await freshFix());
}
