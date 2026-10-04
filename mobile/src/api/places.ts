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

export async function deletePlace(id: string): Promise<{ message: string }> {
  return apiRequest(`/places/${id}`, { method: "DELETE" });
}
