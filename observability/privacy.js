// Shared by the browser, its tunnel, and the status Worker. Error diagnostics
// deliberately contain no request data, user identity, breadcrumbs or free text.
export const privateDataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
  frameContextLines: 0,
};

const errorTypes = new Set([
  "Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError",
  "URIError", "EvalError", "AggregateError", "DOMException", "AbortError",
  "StatusRequestError", "StatusProxyError",
]);
const messages = new Set([
  "Status request failed.",
  "Status history request failed.",
  "Status history returned invalid data.",
  "Status origin is not configured.",
  "Status origin could not be reached.",
  "Status origin returned a server error.",
]);
const operations = new Set(["current_status", "status_history", "origin_fetch", "origin_config"]);
const failureKinds = new Set(["http", "network", "invalid_data", "configuration", "unexpected"]);

export function parseSentryDsn(value) {
  if (typeof value !== "string" || value.length > 512 || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || !url.hostname || url.password || url.search || url.hash ||
        !/^[a-f0-9]{32}$/i.test(url.username) || !/^\/\d+$/.test(url.pathname)) return null;
    const projectId = url.pathname.slice(1);
    const endpoint = new URL(`/api/${projectId}/envelope/`, url.origin);
    endpoint.searchParams.set("sentry_key", url.username);
    endpoint.searchParams.set("sentry_version", "7");
    return { dsn: url.href, envelopeUrl: endpoint.href };
  } catch {
    return null;
  }
}

function safeLabel(value) {
  return typeof value === "string" && /^[A-Za-z0-9@._+\/-]{1,128}$/.test(value)
    ? value : undefined;
}

function frameFilename(value) {
  if (typeof value !== "string") return undefined;
  // Keep bundle paths for source-map lookup, without origins, query strings,
  // fragments or machine-specific directories (which can contain usernames).
  let path = value.split(/[?#]/, 1)[0].replaceAll("\\", "/");
  try { path = new URL(value).pathname; } catch { /* relative bundle path */ }
  const assetPath = path.match(/\/(?:assets|src)\/[A-Za-z0-9_./-]+\.(?:[cm]?js|tsx?)$/)?.[0];
  if (assetPath && !assetPath.includes("..")) return assetPath;
  const basename = path.split("/").at(-1);
  return basename && /^[A-Za-z0-9_.-]+\.(?:[cm]?js|tsx?)$/.test(basename) ? basename : undefined;
}

function stacktrace(stack) {
  if (!Array.isArray(stack?.frames)) return undefined;
  return {
    frames: stack.frames.slice(-40).map((frame) => ({
      filename: frameFilename(frame?.filename),
      function: typeof frame?.function === "string" && /^[A-Za-z0-9_$.[\]<>: /-]{1,120}$/.test(frame.function)
        ? frame.function : undefined,
      lineno: Number.isInteger(frame?.lineno) && frame.lineno >= 0 ? frame.lineno : undefined,
      colno: Number.isInteger(frame?.colno) && frame.colno >= 0 ? frame.colno : undefined,
      in_app: typeof frame?.in_app === "boolean" ? frame.in_app : undefined,
    })),
  };
}

export function sanitizeErrorEvent(event) {
  if (!event || !Array.isArray(event.exception?.values) || !event.exception.values.length) return null;
  const tags = {};
  if (["browser", "status_worker"].includes(event.tags?.runtime)) tags.runtime = event.tags.runtime;
  if (operations.has(event.tags?.operation)) tags.operation = event.tags.operation;
  if (failureKinds.has(event.tags?.failure_kind)) tags.failure_kind = event.tags.failure_kind;
  if (/^[45]\d{2}$/.test(String(event.tags?.http_status))) tags.http_status = String(event.tags.http_status);
  const clean = {
    event_id: /^[a-f0-9]{32}$/i.test(event.event_id ?? "") ? event.event_id : undefined,
    timestamp: typeof event.timestamp === "number" && Number.isFinite(event.timestamp) ? event.timestamp : undefined,
    platform: "javascript",
    level: ["error", "fatal", "warning"].includes(event.level) ? event.level : "error",
    release: safeLabel(event.release),
    environment: safeLabel(event.environment),
    tags,
    exception: {
      values: event.exception.values.slice(-5).map((value) => ({
        type: errorTypes.has(value?.type) ? value.type : "Error",
        value: messages.has(value?.value) ? value.value : "[message omitted]",
        stacktrace: stacktrace(value?.stacktrace),
        mechanism: value?.mechanism ? {
          type: safeLabel(value.mechanism.type) ?? "generic",
          handled: value.mechanism.handled !== false,
        } : undefined,
      })),
    },
  };
  if (tags.operation) clean.fingerprint = ["akron-website", tags.operation, tags.failure_kind ?? "unexpected"];
  // Debug IDs connect the sanitized frame locations to uploaded source maps.
  if (Array.isArray(event.debug_meta?.images)) {
    clean.debug_meta = {
      images: event.debug_meta.images.filter((item) => item?.type === "sourcemap" &&
        /^[a-f0-9-]{36}$/i.test(item.debug_id ?? "")).map((item) => ({
        type: "sourcemap", debug_id: item.debug_id, code_file: frameFilename(item.code_file),
      })),
    };
  }
  return clean;
}

export function isAbortError(error) {
  return error !== null && typeof error === "object" && error.name === "AbortError";
}

// An outage is reported once per phase until that phase recovers. This also
// avoids one event per minute from the status page's refresh loop.
export function createOutageReporter(capture) {
  const reported = new Set();
  return {
    failure(operation, error, offline = false) {
      if (!operations.has(operation) || offline || isAbortError(error) || reported.has(operation)) return;
      reported.add(operation);
      capture(error, {
        operation,
        failure_kind: failureKinds.has(error?.failureKind) ? error.failureKind : "unexpected",
        ...(Number.isInteger(error?.status) ? { http_status: String(error.status) } : {}),
      });
    },
    recovered(operation) { reported.delete(operation); },
  };
}
