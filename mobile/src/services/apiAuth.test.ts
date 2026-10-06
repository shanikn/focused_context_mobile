import { signOut } from "firebase/auth";
import { setOnAuthExpired } from "../api/client";
import { connectApiToFirebase } from "./apiAuth";
import { signOutCleanup } from "./signOutCleanup";

jest.mock("firebase/auth", () => ({ signOut: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../config/firebase", () => ({ auth: { currentUser: null } }));
jest.mock("../api/client", () => ({
  setAuthTokenProvider: jest.fn(),
  setCurrentUserIdProvider: jest.fn(),
  setOnAuthExpired: jest.fn(),
}));
jest.mock("./signOutCleanup", () => ({ signOutCleanup: jest.fn().mockResolvedValue(undefined) }));

test("a sign-in that can't be refreshed signs out with the same cleanup as Sign out", async () => {
  connectApiToFirebase();
  const onExpired = (setOnAuthExpired as jest.Mock).mock.calls[0][0] as () => void;
  onExpired();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(signOut).toHaveBeenCalled();
  expect(signOutCleanup).toHaveBeenCalled();
});
