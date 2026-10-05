import { ApiError, apiRequest, setAuthToken, setAuthTokenProvider, setOnAuthExpired } from "./client";

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => [] });
  global.fetch = fetchMock as unknown as typeof fetch;
  setAuthToken(null);
  setAuthTokenProvider(null);
  setOnAuthExpired(null);
});

const response = (status: number, body: unknown = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const authHeader = (call: number) => fetchMock.mock.calls[call][1].headers.Authorization;

test("asks for a fresh token on every request (Firebase tokens expire after an hour)", async () => {
  const provider = jest.fn().mockResolvedValueOnce("token-1").mockResolvedValueOnce("token-2");
  setAuthTokenProvider(provider);
  await apiRequest("/notes/");
  await apiRequest("/notes/");
  expect(authHeader(0)).toBe("Bearer token-1");
  expect(authHeader(1)).toBe("Bearer token-2");
});

test("falls back to the fixed token when there is no provider", async () => {
  setAuthToken("fixed");
  await apiRequest("/notes/");
  expect(authHeader(0)).toBe("Bearer fixed");
});

test("signed out: no Authorization header", async () => {
  await apiRequest("/");
  expect(authHeader(0)).toBeUndefined();
});

describe("expired token", () => {
  test("a 401 force-refreshes the token once and retries the request", async () => {
    const provider = jest.fn(async (force?: boolean) => (force ? "fresh" : "expired"));
    const onExpired = jest.fn();
    setAuthTokenProvider(provider);
    setOnAuthExpired(onExpired);
    fetchMock
      .mockResolvedValueOnce(response(401, { detail: "authentication required" }))
      .mockResolvedValueOnce(response(200, { id: "n1" }));

    const result = await apiRequest("/notes/", { method: "POST", body: "{}" });

    expect(result).toEqual({ id: "n1" });
    expect(provider).toHaveBeenNthCalledWith(1, false);
    expect(provider).toHaveBeenNthCalledWith(2, true);
    expect(authHeader(0)).toBe("Bearer expired");
    expect(authHeader(1)).toBe("Bearer fresh");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "POST", body: "{}" });
    expect(onExpired).not.toHaveBeenCalled();
  });

  test("still 401 after the refresh: sign out and throw", async () => {
    const onExpired = jest.fn();
    setAuthTokenProvider(async () => "token");
    setOnAuthExpired(onExpired);
    fetchMock.mockResolvedValue(response(401, { detail: "authentication required" }));

    await expect(apiRequest("/notes/")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  test("the refresh itself failing: sign out and throw the 401", async () => {
    const onExpired = jest.fn();
    setAuthTokenProvider(async (force?: boolean) => {
      if (force) throw new Error("network");
      return "token";
    });
    setOnAuthExpired(onExpired);
    fetchMock.mockResolvedValue(response(401));
    await expect(apiRequest("/notes/")).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  test("other errors are not retried and don't sign out", async () => {
    const onExpired = jest.fn();
    setAuthTokenProvider(async () => "token");
    setOnAuthExpired(onExpired);
    fetchMock.mockResolvedValue(response(500));
    await expect(apiRequest("/notes/")).rejects.toMatchObject({ status: 500 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onExpired).not.toHaveBeenCalled();
  });
});
