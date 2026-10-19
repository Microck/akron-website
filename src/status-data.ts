// Validate untrusted API JSON before it reaches React state and rendering.
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function timestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
export function validEndpoints(value: unknown): boolean {
  return Array.isArray(value) && value.every((endpoint) =>
    record(endpoint) && typeof endpoint.name === "string" &&
    typeof endpoint.group === "string" && typeof endpoint.key === "string" &&
    Array.isArray(endpoint.results) && endpoint.results.every((result: unknown) =>
      record(result) && typeof result.success === "boolean" &&
      timestamp(result.timestamp) && typeof result.duration === "number" &&
      Number.isFinite(result.duration) && typeof result.status === "number" &&
      Number.isFinite(result.status)));
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
