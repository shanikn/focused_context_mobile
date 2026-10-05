import { apiRequest } from "./client";
import { AddressResult } from "../lib/nominatim";
import { LatLon } from "../lib/geo";

// Address search through our backend (Google Places or OpenStreetMap). With a
// location, nearby results come first; it's rounded to about 1 km, which is
// all the bias needs.
export async function geocodeViaBackend(query: string, near?: LatLon): Promise<AddressResult[]> {
  const params = new URLSearchParams({ q: query });
  if (near) {
    params.set("lat", near.latitude.toFixed(2));
    params.set("lon", near.longitude.toFixed(2));
  }
  return apiRequest(`/places/search?${params.toString()}`);
}
