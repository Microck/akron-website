import { build } from "esbuild";
import { sentryEsbuildPlugin } from "@sentry/esbuild-plugin";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const directory = dirname(fileURLToPath(import.meta.url));
const output = resolve(process.argv[2] || resolve(directory, "dist"));
await mkdir(output, { recursive: true });
const uploadMaps = Boolean(process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_STATUS_PROJECT);
await build({
  entryPoints: [resolve(directory, "status-api-worker.js")],
  outfile: resolve(output, "worker.js"),
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  mainFields: ["module", "main"],
  conditions: ["workerd", "worker", "browser", "production"],
  external: ["cloudflare:*", "node:*"],
  sourcemap: "external",
  sourcesContent: false,
  minify: true,
  plugins: uploadMaps ? [sentryEsbuildPlugin({
    authToken: process.env.SENTRY_AUTH_TOKEN,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_STATUS_PROJECT,
    telemetry: false,
    ...(process.env.SENTRY_RELEASE ? { release: { name: process.env.SENTRY_RELEASE } } : {}),
    sourcemaps: { assets: [resolve(output, "worker.js"), resolve(output, "worker.js.map")] },
  })] : [],
});
