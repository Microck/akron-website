// Validate untrusted API JSON before it reaches React state and rendering.
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
const isoTimestamp = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
function timestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = isoTimestamp.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  return calendar.getUTCFullYear() === year && calendar.getUTCMonth() === month - 1 && calendar.getUTCDate() === day;
}
export function validEndpoints(value: unknown): boolean {
  return Array.isArray(value) && value.every((endpoint) =>
    record(endpoint) && typeof endpoint.name === "string" &&
    typeof endpoint.group === "string" && typeof endpoint.key === "string" &&
    Array.isArray(endpoint.results) && endpoint.results.every((result: unknown) =>
      record(result) && typeof result.success === "boolean" &&
      timestamp(result.timestamp) && typeof result.duration === "number" &&
      Number.isFinite(result.duration) && (result.status === undefined ||
      (typeof result.status === "number" && Number.isFinite(result.status)))));
}
export function validConfig(value: unknown): boolean {
  return record(value) && (value.announcements === undefined ||
    (Array.isArray(value.announcements) && value.announcements.every((item: unknown) =>
      record(item) && timestamp(item.timestamp) && typeof item.message === "string" &&
      typeof item.type === "string" && ["information", "none", "operational", "outage", "warning"].includes(item.type) &&
      (item.archived === undefined || typeof item.archived === "boolean"))));
}
export function validHistory(value: unknown): boolean {
  return record(value) && (value.events === undefined ||
    (Array.isArray(value.events) && value.events.every((event: unknown) =>
      record(event) && timestamp(event.timestamp) &&
      typeof event.type === "string" && ["START", "HEALTHY", "UNHEALTHY"].includes(event.type))));
}

export function parseUptime(raw: string): number | null {
  if (raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}
