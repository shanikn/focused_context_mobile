import { signOut } from "firebase/auth";
import { auth } from "../config/firebase";
import { setAuthTokenProvider, setOnAuthExpired } from "../api/client";
import { clearReminderSchedule } from "./scheduledReminders";

// Connects the API client to Firebase: a fresh ID token for every request,
// and sign-out when the backend still says 401 after a forced refresh.
export function connectApiToFirebase() {
  setAuthTokenProvider(async (forceRefresh) => {
    const user = auth.currentUser;
    return user ? user.getIdToken(forceRefresh) : null;
  });
  setOnAuthExpired(() => {
    signOut(auth).catch(() => {});
    // the next user mustn't get this user's alarms
    clearReminderSchedule().catch(() => {});
  });
}
