import { apiRequest } from "./client";
import { Note } from "../types/notes";

export async function createNote(
  content: string,
  listName: string = "General",
  remindersEnabled: boolean = true,
  categoryExplicit: boolean = false,
  category?: string,
  remindDateExplicit: boolean = false,
  remindTimeExplicit: boolean = false,
  remindAtHour?: number,
  remindAtMinute?: number,
  remindOnDate?: string
): Promise<{ id: string; content: string; category: string }> {
  return apiRequest("/notes/", {
    method: "POST",
    body: JSON.stringify({
      content,
      list_name: listName,
      reminders_enabled: remindersEnabled,
      category_explicit: categoryExplicit,
      category: category ?? null,
      remind_date_explicit: remindDateExplicit,
      remind_time_explicit: remindTimeExplicit,
      remind_at_hour: remindAtHour ?? null,
      remind_at_minute: remindAtMinute ?? null,
      remind_on_date: remindOnDate ?? null,
    }),
  });
}

export async function getNotes(): Promise<Note[]> {
  return apiRequest("/notes/");
}

export async function updateNote(
  noteId: string,
  fields: {
    content?: string;
    list_name?: string;
    category?: string;
    category_explicit?: boolean;
    contexts?: string;
    remind_date_explicit?: boolean;
    remind_time_explicit?: boolean;
    remind_at_hour?: number | string;
    remind_at_minute?: number | string;
    remind_on_date?: string;
    reminders_enabled?: boolean;
  }
): Promise<{ message: string }> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      params.append(key, String(value));
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
