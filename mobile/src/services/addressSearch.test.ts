import { ApiError } from "../api/client";
import { AddressSearchError, searchErrorMessage } from "../lib/nominatim";
import { findAddress } from "./addressSearch";

const RESULTS = [{ label: "Reichman University, Herzliya", latitude: 32.176, longitude: 34.837 }];

function deps(backend: jest.Mock, direct = jest.fn()) {
  return { viaBackend: backend, direct };
}

test("asks the backend proxy, not Nominatim directly", async () => {
  const backend = jest.fn().mockResolvedValue(RESULTS);
  const direct = jest.fn();
  expect(await findAddress("Reichman University", deps(backend, direct))).toEqual(RESULTS);
  expect(backend).toHaveBeenCalledWith("Reichman University");
  expect(direct).not.toHaveBeenCalled();
});

test("strips RTL marks and skips empty queries", async () => {
  const backend = jest.fn().mockResolvedValue([]);
  await findAddress("‏Reichman‎ ", deps(backend));
  expect(backend).toHaveBeenCalledWith("Reichman");
  expect(await findAddress("  ‏ ", deps(backend))).toEqual([]);
  expect(backend).toHaveBeenCalledTimes(1);
});

test("older backend without /geocode/ (404): falls back to Nominatim directly", async () => {
  const backend = jest.fn().mockRejectedValue(new ApiError(404, '{"detail":"Not Found"}'));
  const direct = jest.fn().mockResolvedValue(RESULTS);
  expect(await findAddress("Reichman University", deps(backend, direct))).toEqual(RESULTS);
  expect(direct).toHaveBeenCalledWith("Reichman University");
});

async function errorFrom(backendError: unknown) {
  const backend = jest.fn().mockRejectedValue(backendError);
  try {
    await findAddress("x", deps(backend));
  } catch (e) {
    return e as AddressSearchError;
  }
  throw new Error("expected findAddress to throw");
}

test("Nominatim refused the backend (502 blocked) -> blocked, with the upstream status", async () => {
  const e = await errorFrom(new ApiError(502, '{"detail":{"kind":"blocked","upstream_status":403}}'));
  expect(e.kind).toBe("blocked");
  expect(searchErrorMessage(e)).toMatch(/refused/i);
  expect(searchErrorMessage(e)).toMatch(/403/);
});

test("429 -> rate limited", async () => {
  const e = await errorFrom(new ApiError(429, '{"detail":{"kind":"rate_limited","upstream_status":429}}'));
  expect(e.kind).toBe("rate_limited");
});

test("504 (Nominatim unreachable from the backend) -> timeout", async () => {
  const e = await errorFrom(new ApiError(504, '{"detail":{"kind":"network","upstream_status":null}}'));
  expect(e.kind).toBe("timeout");
});

test("other backend error -> http, with its status", async () => {
  const e = await errorFrom(new ApiError(500, "Internal Server Error"));
  expect(e.kind).toBe("http");
  expect(searchErrorMessage(e)).toMatch(/500/);
});

test("signed out (401) -> http 401, not a fallback", async () => {
  const direct = jest.fn();
  const backend = jest.fn().mockRejectedValue(new ApiError(401, '{"detail":"Authentication required"}'));
  await expect(findAddress("x", deps(backend, direct))).rejects.toMatchObject({ kind: "http", status: 401 });
  expect(direct).not.toHaveBeenCalled();
});

test("backend unreachable -> network, with the underlying error", async () => {
  const e = await errorFrom(new TypeError("Network request failed"));
  expect(e.kind).toBe("network");
  expect(searchErrorMessage(e)).toMatch(/Network request failed/);
});
