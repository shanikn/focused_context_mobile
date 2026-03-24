const BASE_URL = "https://contextmind-api-hngzd9ewbzg5cxhm.israelcentral-01.azurewebsites.net";

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export async function apiRequest(
  path: string,
  options: RequestInit = {}
): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`API error ${response.status}: ${body}`);
    throw new Error(`API error ${response.status}: ${body}`);
  }

  return response.json();
}
