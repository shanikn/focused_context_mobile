const DEFAULT_BASE_URL =
  "https://contextmind-api-hngzd9ewbzg5cxhm.israelcentral-01.azurewebsites.net";

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

const BASE_URL = normalizeBaseUrl(
  process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_BASE_URL
);

let authToken: string | null = null;

// thrown for non-2xx responses; keeps the status so callers can react to it
export class ApiError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(`API error ${status}: ${body}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

// Gets the Firebase ID token for each request. getIdToken() returns the
// cached token and refreshes it when it's about to expire (they last an hour);
// forceRefresh=true always fetches a new one.
export type AuthTokenProvider = (forceRefresh: boolean) => Promise<string | null>;

let tokenProvider: AuthTokenProvider | null = null;
let onAuthExpired: (() => void) | null = null;

// a fixed token, used only when there's no provider (tests)
// What to show for a failed request: the server's own message when it sends
// one (e.g. "Too many changes, try again in a minute."), else the fallback.
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    try {
      const message = JSON.parse(error.body)?.detail?.message;
      if (typeof message === "string" && message) {
        return message;
      }
    } catch {
      // not JSON
    }
  }
  return fallback;
}

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function setAuthTokenProvider(provider: AuthTokenProvider | null) {
  tokenProvider = provider;
}

// called when a request is still rejected (401) after refreshing the token
export function setOnAuthExpired(callback: (() => void) | null) {
  onAuthExpired = callback;
}

async function currentToken(forceRefresh: boolean): Promise<string | null> {
  return tokenProvider ? tokenProvider(forceRefresh) : authToken;
}

function authExpired() {
  try {
    onAuthExpired?.();
  } catch {
    // signing out is best effort; the request still fails with the 401
  }
}

export async function apiRequest(
  path: string,
  options: RequestInit = {}
): Promise<any> {
  const send = (token: string | null) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return fetch(`${BASE_URL}${path}`, { ...options, headers });
  };

  let response = await send(await currentToken(false));

  // the token may have expired (e.g. the app was asleep): refresh it once and retry
  if (response.status === 401 && tokenProvider) {
    let fresh: string | null = null;
    try {
      fresh = await currentToken(true);
    } catch {
      fresh = null;
    }
    if (fresh) {
      response = await send(fresh);
    }
    if (response.status === 401) {
      authExpired();
    }
  }

  if (!response.ok) {
    const body = await response.text();
    console.error(`API error ${response.status}: ${body}`);
    throw new ApiError(response.status, body);
  }

  return response.json();
}
