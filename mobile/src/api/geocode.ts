import { apiRequest } from "./client";
import { AddressResult } from "../lib/nominatim";

// Address search through our backend, which asks OpenStreetMap Nominatim.
export async function geocodeViaBackend(query: string): Promise<AddressResult[]> {
  return apiRequest(`/geocode/?${new URLSearchParams({ q: query }).toString()}`);
}
