import { LocationBucket } from "./reminderPrefs";
import { Place, PLACE_BUCKETS, PlaceBucket } from "./places";

// Pure logic for geofence events; the task itself lives in services/geofence.ts

export type GeofenceEvent = "enter" | "exit";

function isPlaceBucket(value: string): value is PlaceBucket {
  return (PLACE_BUCKETS as readonly string[]).includes(value);
}

// Regions are identified by their bucket. Enter switches to that bucket;
// Exit only resets to "unknown" if we're still in the bucket being exited,
// so a later Enter (or a manual pick) isn't undone by an older Exit.
export function bucketAfterGeofenceEvent(
  event: GeofenceEvent,
  regionId: string,
  current: LocationBucket
): { bucket: LocationBucket; arrived: boolean } {
  if (!isPlaceBucket(regionId)) {
    return { bucket: current, arrived: false };
  }
  if (event === "enter") {
    return { bucket: regionId, arrived: true };
  }
  return { bucket: current === regionId ? "unknown" : current, arrived: false };
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

export function regionsFromPlaces(places: Place[]): GeofenceRegion[] {
  return places.map((p) => ({
    identifier: p.bucket,
    latitude: p.latitude,
    longitude: p.longitude,
    radius: p.radius,
    notifyOnEnter: true,
    notifyOnExit: true,
  }));
}

export interface GeofenceConditions {
  foreground: boolean;
  background: boolean;
  notificationsEnabled: boolean; // the in-app switch
  notificationsGranted: boolean; // the OS permission
  placeCount: number;
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
