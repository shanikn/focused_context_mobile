import { apiRequest } from "./client";
import { Note } from "../types/notes";

export async function createNote(
  content: string,
  listName: string = "General",
  remindAtHour?: number,
  remindOnDate?: string
): Promise<{ id: string; content: string; category: string }> {
  return apiRequest("/notes/", {
    method: "POST",
    body: JSON.stringify({
      content,
      list_name: listName,
      remind_at_hour: remindAtHour ?? null,
      remind_on_date: remindOnDate ?? null,
    }),
  });
}

export async function getNotes(): Promise<Note[]> {
  return apiRequest("/notes/");
}

export async function updateNote(
  noteId: string,
  fields: { content?: string; category?: string; contexts?: string; remind_on_date?: string }
): Promise<{ message: string }> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      params.append(key, value);
    }
  }
  return apiRequest(`/notes/${noteId}?${params.toString()}`, {
    method: "PUT",
  });
}

export async function deleteNote(noteId: string): Promise<{ message: string }> {
  return apiRequest(`/notes/${noteId}`, {
    method: "DELETE",
  });
}
