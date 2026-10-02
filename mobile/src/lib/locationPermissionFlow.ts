// Pure logic for the location permission flow. Runs only after the user taps
// (never on app start):
//   explain screen -> foreground request -> disclosure screen
//   -> background request ("Allow all the time") -> notifications request
// Screens ("explain", "disclosure") wait for the user; the other steps are
// system permission requests. Steps already granted are skipped.

export type PermissionStep =
  | "explain"
  | "foreground"
  | "disclosure"
  | "background"
  | "notifications"
  | "done";

export interface GrantedPermissions {
  foreground: boolean;
  background: boolean;
  notifications: boolean;
}

function afterBackground(p: GrantedPermissions): PermissionStep {
  return p.notifications ? "done" : "notifications";
}

function afterForeground(p: GrantedPermissions): PermissionStep {
  return p.background ? afterBackground(p) : "disclosure";
}

export function startStep(p: GrantedPermissions): PermissionStep {
  return p.foreground ? afterForeground(p) : "explain";
}

// `p` is the permission state after the current step finished
export function nextStep(step: PermissionStep, p: GrantedPermissions): PermissionStep {
  switch (step) {
    case "explain":
      return p.foreground ? afterForeground(p) : "foreground";
    case "foreground":
      // denied: stop here, the manual picker keeps working
      return p.foreground ? afterForeground(p) : "done";
    case "disclosure":
      return "background";
    case "background":
      // denied is fine too: notifications still help with the manual picker
      return afterBackground(p);
    case "notifications":
    case "done":
      return "done";
  }
}

export interface LocationStatus {
  mode: "automatic" | "manual";
  message: string;
}

export function locationStatus(p: GrantedPermissions): LocationStatus {
  if (p.foreground && p.background) {
    return {
      mode: "automatic",
      message: "Automatic: FocusedContext notices when you arrive at a saved place.",
    };
  }
  if (p.foreground) {
    return {
      mode: "manual",
      message:
        'Background location is off ("Allow all the time" not granted), so arrivals ' +
        "can't be detected. Set your current context with the picker below.",
    };
  }
  return {
    mode: "manual",
    message: "Location is off. Set your current context with the picker below.",
  };
}
