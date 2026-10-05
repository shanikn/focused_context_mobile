import { LatLon } from "../lib/geo";
import { addressNear } from "../lib/mapPick";
import { AddressResult } from "../lib/nominatim";
import { getAllCoords, setPlaceCoords } from "../lib/userPlaces";
import { findAddress } from "./addressSearch";

// Saving a point picked on the map: the coordinates first (instant), then
// the address by reverse geocoding through the backend's address search,
// which Nominatim answers with the nearest address for a "lat,lon" query.

export async function savePickedPoint(placeId: string, point: LatLon): Promise<void> {
  // keeps the place's radius; an address from before is dropped
  await setPlaceCoords(placeId, point, undefined, { source: "map" });
}

// The address near the point, saved if the place is still where it was
// pinned. Returns it, or null (no answer, nothing close, or moved since).
export async function fillPickedAddress(
  placeId: string,
  point: LatLon,
  find: (query: string) => Promise<AddressResult[]> = findAddress
): Promise<string | null> {
  let label: string | null;
  try {
    label = addressNear(await find(`${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`), point);
  } catch {
    return null;
  }
  if (!label) {
    return null;
  }
  const current = (await getAllCoords())[placeId];
  const unchanged =
    current?.source === "map" && current.latitude === point.latitude && current.longitude === point.longitude;
  if (!unchanged) {
    return null;
  }
  await setPlaceCoords(placeId, point, undefined, { source: "map", address: label });
  return label;
}
