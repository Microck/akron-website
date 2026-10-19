# Akron Website

Single-page landing site for Akron.

```sh
bun install
bun run dev
```

Optional browser and status API error reporting: [Sentry setup](docs/sentry.md).

## Browser flow tests

The deterministic [tester-army/e2e](https://github.com/tester-army/e2e) suite
requires no AI provider, account credentials, or agent calls. API fixtures are
intercepted locally; it does not contact production status services or install
Akron. Run against the production build:

```sh
bun install --frozen-lockfile
bun run build
bunx e2e-web install chromium
bun run test:e2e
```

Coverage includes desktop/mobile landing links, healthy/degraded status,
current/history request failure, malformed current data, announcements, and
return navigation. Platform redirects and release URLs also have unit tests;
Vercel/Mintlify/Discord availability and authenticated upload flows are not
covered by the local fixture suite. `.e2e/` holds local failure traces.
`E2E_CDP_ENDPOINT` optionally attaches an isolated test Chromium instance.

The date-formatting microbenchmark checks equivalent output before timing:
`node tools/benchmark-status-format.mjs`. It measures formatter work, not an
end-to-end page-speed guarantee.
