// Names shared by the geofence task (geofence.ts) and sign-out cleanup, kept
// apart so the cleanup doesn't load the whole geofence task module.

export const GEOFENCE_TASK = "focusedcontext-geofence";

// when and which regions were last registered (see shouldNotifyArrival)
export const GEOFENCE_REGISTERED_AT_KEY = "focusedcontext.geofence.registeredAt";
export const GEOFENCE_REGIONS_KEY = "focusedcontext.geofence.regions";
