import { apiRequest } from "./client";

// Deletes everything of the signed-in user on the server, then the Firebase user.
export async function deleteAccount(): Promise<{
  deleted: { notes: number; places: number; vectors: number };
  firebase_user: string;
}> {
  return apiRequest("/account", { method: "DELETE" });
}
