import { TextInputProps } from "react-native";

// Address fields take Hebrew as well as English: a plain text keyboard (a
// type like "email-address" or "visible-password" can hide the Hebrew layout
// on some Android keyboards), and no auto-capitalize or autocorrect, which
// mangle street names. Pair with writingDirection: "auto" in the style.
export const ADDRESS_INPUT_PROPS: Partial<TextInputProps> = {
  keyboardType: "default",
  autoCapitalize: "none",
  autoCorrect: false,
  autoComplete: "off",
  importantForAutofill: "no",
};
