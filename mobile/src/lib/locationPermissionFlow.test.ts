import {
  GrantedPermissions,
  locationStatus,
  nextStep,
  startStep,
} from "./locationPermissionFlow";

const perms = (p: Partial<GrantedPermissions> = {}): GrantedPermissions => ({
  foreground: false,
  background: false,
  notifications: false,
  ...p,
});

describe("startStep", () => {
  test("nothing granted: start with the explanation screen", () => {
    expect(startStep(perms())).toBe("explain");
  });

  test("foreground already granted: skip to the background disclosure", () => {
    expect(startStep(perms({ foreground: true }))).toBe("disclosure");
  });

  test("location fully granted: only notifications left", () => {
    expect(startStep(perms({ foreground: true, background: true }))).toBe("notifications");
  });

  test("everything granted: nothing to do", () => {
    expect(
      startStep(perms({ foreground: true, background: true, notifications: true }))
    ).toBe("done");
  });
});

describe("nextStep follows explain -> foreground -> disclosure -> background -> notifications", () => {
  test("explanation screen leads to the foreground request", () => {
    expect(nextStep("explain", perms())).toBe("foreground");
  });

  test("foreground granted: show the background disclosure", () => {
    expect(nextStep("foreground", perms({ foreground: true }))).toBe("disclosure");
  });

  test("foreground denied: stop, the manual picker stays in use", () => {
    expect(nextStep("foreground", perms())).toBe("done");
  });

  test("disclosure screen leads to the background request", () => {
    expect(nextStep("disclosure", perms({ foreground: true }))).toBe("background");
  });

  test("background granted or denied: continue to notifications", () => {
    expect(nextStep("background", perms({ foreground: true, background: true }))).toBe(
      "notifications"
    );
    expect(nextStep("background", perms({ foreground: true }))).toBe("notifications");
  });

  test("notifications already granted: skip the request", () => {
    expect(
      nextStep("background", perms({ foreground: true, background: true, notifications: true }))
    ).toBe("done");
  });

  test("background already granted: skip disclosure and background", () => {
    expect(nextStep("foreground", perms({ foreground: true, background: true }))).toBe(
      "notifications"
    );
  });

  test("notifications step ends the flow", () => {
    expect(nextStep("notifications", perms())).toBe("done");
  });

  test("done stays done", () => {
    expect(nextStep("done", perms())).toBe("done");
  });
});

describe("locationStatus", () => {
  test("foreground + background: automatic", () => {
    const s = locationStatus(perms({ foreground: true, background: true }));
    expect(s.mode).toBe("automatic");
  });

  test("background denied: manual, and says so", () => {
    const s = locationStatus(perms({ foreground: true }));
    expect(s.mode).toBe("manual");
    expect(s.message).toMatch(/background location is off/i);
    expect(s.message).toMatch(/picker/i);
  });

  test("no location at all: manual", () => {
    const s = locationStatus(perms());
    expect(s.mode).toBe("manual");
    expect(s.message).toMatch(/picker/i);
  });
});
