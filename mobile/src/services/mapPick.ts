import { LatLon } from "../lib/geo";
import { addressNear } from "../lib/mapPick";
import { AddressResult } from "../lib/nominatim";
import { getAllCoords, setPlaceCoords } from "../lib/userPlaces";
import { findAddress } from "./addressSearch";

// Saving a point picked on the map: the coordinates first (instant), then
// the address by reverse geocoding through the backend's address search,
// which Nominatim answers with the nearest address for a "lat,lon" query.

// "map": picked on the map; "pasted": coordinates or a Google Maps link
type PointSource = "map" | "pasted";

export async function savePickedPoint(placeId: string, point: LatLon, source: PointSource = "map"): Promise<void> {
  // keeps the place's radius; an address from before is dropped
  await setPlaceCoords(placeId, point, undefined, { source });
}

// The address near the point, saved if the place is still where it was
// pinned. Returns it, or null (no answer, nothing close, or moved since).
export async function fillPickedAddress(
  placeId: string,
  point: LatLon,
  find: (query: string) => Promise<AddressResult[]> = findAddress,
  source: PointSource = "map"
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
    current?.source === source && current.latitude === point.latitude && current.longitude === point.longitude;
  if (!unchanged) {
    return null;
  }
  await setPlaceCoords(placeId, point, undefined, { source, address: label });
  return label;
}
