import { apiRequest } from "./client";
import { ServerPlace } from "../lib/userPlaces";

// Place names and keywords live on the backend (per user).
// Coordinates never leave the phone.

export async function listPlaces(): Promise<ServerPlace[]> {
  return apiRequest("/places/");
}

export async function createPlace(name: string, keywords: string[] = []): Promise<ServerPlace> {
  return apiRequest("/places/", {
    method: "POST",
    body: JSON.stringify({ name, keywords }),
  });
}

export async function updatePlace(
  id: string,
  fields: { name?: string; keywords?: string[] }
): Promise<ServerPlace> {
  return apiRequest(`/places/${id}`, {
    method: "PUT",
    body: JSON.stringify(fields),
  });
}

// stores of a type around a position, nearest first (OpenStreetMap via the backend)
export async function nearbyStores(
  type: string,
  lat: number,
  lon: number,
  radiusM: number = 2000
): Promise<{ id: string; name: string; lat: number; lon: number }[]> {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon), type, radius_m: String(radiusM) });
  return apiRequest(`/places/nearby?${params.toString()}`);
}

// coordinates of a Google Maps link; the server follows short share links
export async function resolveMapsLink(url: string): Promise<{ latitude: number; longitude: number }> {
  return apiRequest(`/places/resolve-link?${new URLSearchParams({ url }).toString()}`);
}

export async function deletePlace(id: string): Promise<{ message: string }> {
  return apiRequest(`/places/${id}`, { method: "DELETE" });
}
