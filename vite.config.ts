import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { sentryVitePlugin } from "@sentry/vite-plugin";

export default defineConfig(({ command, mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  const release = env.SENTRY_RELEASE || env.VERCEL_GIT_COMMIT_SHA || "";
  const uploadMaps = command === "build" && Boolean(env.VITE_SENTRY_DSN &&
    env.SENTRY_AUTH_TOKEN && env.SENTRY_ORG && env.SENTRY_PROJECT);
  return {
    define: {
      "import.meta.env.VITE_SENTRY_RELEASE": JSON.stringify(release),
      "import.meta.env.VITE_SENTRY_ENVIRONMENT": JSON.stringify(env.VITE_SENTRY_ENVIRONMENT || env.VERCEL_ENV || mode),
    },
    build: { sourcemap: uploadMaps ? "hidden" : false },
    plugins: [
      react(),
      ...(uploadMaps ? [sentryVitePlugin({
        authToken: env.SENTRY_AUTH_TOKEN,
        org: env.SENTRY_ORG,
        project: env.SENTRY_PROJECT,
        telemetry: false,
        ...(release ? { release: { name: release } } : {}),
        sourcemaps: { filesToDeleteAfterUpload: ["./dist/**/*.map"] },
      })] : []),
    ],
  };
});
