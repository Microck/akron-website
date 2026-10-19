import { expect, test } from "bun:test";
import { parseUptime, validConfig, validEndpoints, validHistory } from "../src/status-data";
const timestamp = "2026-10-19T12:00:00Z";
const endpoint = { name: "Website", group: "Core", key: "core_website", results: [{ success: true, timestamp, duration: 1, status: 200 }] };
test("validates current status before committing it to React state", () => {
  expect(validEndpoints([endpoint])).toBe(true);
  expect(validEndpoints([])).toBe(true);
  for (const value of [null, {}, [null], [{ ...endpoint, results: null }], [{ ...endpoint, results: [{ success: true, timestamp: "invalid", duration: 1, status: 200 }] }]]) expect(validEndpoints(value)).toBe(false);
});
test("rejects invalid config while allowing absent announcements", () => {
  expect(validConfig({})).toBe(true);
  expect(validConfig({ announcements: [{ timestamp, type: "information", message: "Notice" }] })).toBe(true);
  for (const value of [null, [], { announcements: null }, { announcements: [{ timestamp: "bad", type: "information", message: "Notice" }] }]) expect(validConfig(value)).toBe(false);
});
test("validates history independently from current health", () => {
  expect(validHistory({})).toBe(true);
  expect(validHistory({ events: [{ timestamp, type: "START" }] })).toBe(true);
  for (const value of [null, { events: {} }, { events: [{ timestamp, type: "unexpected" }] }, { events: [{ timestamp: "bad", type: "HEALTHY" }] }]) expect(validHistory(value)).toBe(false);
});

test("uptime rejects blank bodies without rejecting a real zero", () => {
  for (const raw of ["", " ", "\n\t", "NaN", "Infinity", "-1", "1.01"]) expect(parseUptime(raw)).toBeNull();
  expect(parseUptime("0")).toBe(0);
  expect(parseUptime(" 0.99\n")).toBe(0.99);
  expect(parseUptime("1")).toBe(1);
});

test("status-less network failures remain valid while malformed statuses fail", () => {
  const failed = { success: false, timestamp, duration: 1 };
  expect(validEndpoints([{ ...endpoint, results: [failed] }])).toBe(true);
  for (const status of [null, "500", NaN]) expect(validEndpoints([{ ...endpoint, results: [{ ...failed, status }] }])).toBe(false);
});
