import { UNKNOWN, UserPlace } from "./userPlaces";

// Pure logic for geofence events; the task itself lives in services/geofence.ts.
// Region identifiers are place ids, and so is the current location.

export type GeofenceEvent = "enter" | "exit";

// Enter switches to that place; Exit only resets to "unknown" if we're still
// at the place being exited, so a later Enter (or a manual pick) isn't undone
// by an older Exit. Regions for places that no longer exist are ignored.
export function locationAfterGeofenceEvent(
  event: GeofenceEvent,
  regionId: string,
  current: string,
  knownPlaceIds: Set<string>
): { location: string; arrived: boolean } {
  if (!knownPlaceIds.has(regionId)) {
    return { location: current, arrived: false };
  }
  if (event === "enter") {
    return { location: regionId, arrived: true };
  }
  return { location: current === regionId ? UNKNOWN : current, arrived: false };
}

// same shape as expo-location's LocationRegion
export interface GeofenceRegion {
  identifier: string;
  latitude: number;
  longitude: number;
  radius: number;
  notifyOnEnter: boolean;
  notifyOnExit: boolean;
}

// only places with coordinates on this phone get a region
export function regionsFromPlaces(places: UserPlace[]): GeofenceRegion[] {
  return places.flatMap((p) =>
    p.coords
      ? [
          {
            identifier: p.id,
            latitude: p.coords.latitude,
            longitude: p.coords.longitude,
            radius: p.coords.radius,
            notifyOnEnter: true,
            notifyOnExit: true,
          },
        ]
      : []
  );
}

export interface GeofenceConditions {
  foreground: boolean;
  background: boolean;
  notificationsEnabled: boolean; // the in-app switch
  notificationsGranted: boolean; // the OS permission
  placeCount: number; // places with coordinates
}

export function shouldGeofence(c: GeofenceConditions): boolean {
  return (
    c.foreground &&
    c.background &&
    c.notificationsEnabled &&
    c.notificationsGranted &&
    c.placeCount > 0
  );
}

// Android reports ENTER right away for every region you're already inside when
// geofences are (re-)registered (expo-location sets INITIAL_TRIGGER_ENTER).
// Those aren't arrivals: within this window after registering, ENTER only
// updates the current place and doesn't notify.
export const INITIAL_ENTER_GRACE_MS = 60_000;

export function shouldNotifyArrival(
  event: GeofenceEvent,
  now: number,
  registeredAt: number | null,
  graceMs: number = INITIAL_ENTER_GRACE_MS
): boolean {
  if (event !== "enter") {
    return false;
  }
  return registeredAt === null || now - registeredAt >= graceMs;
}

function regionKey(r: GeofenceRegion): string {
  return [r.identifier, r.latitude, r.longitude, r.radius, r.notifyOnEnter, r.notifyOnExit].join("|");
}

// Re-registering resets Android's geofences (and fires initial ENTERs), so
// only do it when the regions actually changed.
export function regionsChanged(previous: GeofenceRegion[] | null, next: GeofenceRegion[]): boolean {
  if (!previous || previous.length !== next.length) {
    return true;
  }
  const a = previous.map(regionKey).sort();
  const b = next.map(regionKey).sort();
  return a.some((key, i) => key !== b[i]);
}
