import { authErrorMessage } from "./authErrors";

const err = (code: string) => Object.assign(new Error(`Firebase: Error (${code}).`), { code });

test.each([
  ["auth/invalid-credential", "That email and password don't match."],
  ["auth/wrong-password", "That email and password don't match."],
  ["auth/email-already-in-use", "That email already has an account. Sign in instead."],
  ["auth/weak-password", "Use at least 6 characters."],
  ["auth/invalid-email", "That doesn't look like an email address."],
  ["auth/network-request-failed", "No connection. Check your internet and try again."],
])("%s -> plain sentence", (code, message) => {
  expect(authErrorMessage(err(code))).toBe(message);
});

test("any other code: a generic message, never the raw Firebase text", () => {
  expect(authErrorMessage(err("auth/too-many-requests"))).toBe("Couldn't sign in. Try again.");
});

test("errors without a code, or not errors at all", () => {
  expect(authErrorMessage(new Error("boom"))).toBe("Couldn't sign in. Try again.");
  expect(authErrorMessage(null)).toBe("Couldn't sign in. Try again.");
  expect(authErrorMessage("auth/invalid-email")).toBe("Couldn't sign in. Try again.");
});

describe("password reset messages", () => {
  const { resetErrorMessage } = require("./authErrors");
  test.each([
    ["auth/invalid-email", "That doesn't look like an email address."],
    ["auth/missing-email", "That doesn't look like an email address."],
    ["auth/network-request-failed", "No connection. Check your internet and try again."],
    ["auth/anything-else", "Couldn't send the reset email. Try again later."],
  ])("%s", (code, message) => {
    expect(resetErrorMessage({ code })).toBe(message);
  });

  test("an unknown account isn't an error (don't reveal who has one)", () => {
    expect(resetErrorMessage({ code: "auth/user-not-found" })).toBeNull();
  });
});
