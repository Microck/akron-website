import { test } from "@e2e-dev/web";
import { expect } from "e2e";

for (const width of [1280, 390]) {
  test(`landing links remain available at ${width}px`, async ({ app, browser, screen }) => {
    await browser.setViewport({ width, height: 844 });
    await app.open("/");
    for (const [name, href] of [["Download", "/raw"], ["Olympus", "/olympus"], ["Docs", "/docs"], ["Discord", "/discord"], ["GameBanana", "https://gamebanana.com/mods/681169"], ["GitHub", "https://github.com/Microck/Akron"]]) {
      await expect(screen.getByRole("link", name)).toBeVisible();
      await expect(screen.getByRole("link", name)).toHaveAttribute("href", href);
    }
    const overflow = await browser.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
}

for (const mode of ["healthy", "degraded", "network-outage", "history-failure", "blank-uptime", "current-failure", "invalid-current"] as const) {
  test(`status handles ${mode}`, async ({ app, browser, screen }) => {
    const timestamp = new Date().toISOString();
    const endpoint = { name: "Website", group: "Core", key: "core_website", results: [{ success: mode !== "degraded" && mode !== "network-outage", timestamp, duration: 25_000_000, ...(mode === "network-outage" ? {} : { status: mode === "degraded" ? 500 : 200 }) }] };
    await browser.route("**/status-api/**", async (route) => {
      const path = new URL(route.request.url).pathname;
      if (path.endsWith("/config")) return route.fulfill({ json: { announcements: [{ timestamp, type: "information", message: "Scheduled test notice" }, { timestamp, type: "operational", message: "Resolved test incident", archived: true }] } });
      if (path.endsWith("/endpoints/statuses")) {
        if (mode === "current-failure") return route.fulfill({ status: 503, body: "Unavailable" });
        return route.fulfill({ json: mode === "invalid-current" ? { error: "invalid" } : [endpoint] });
      }
      if (mode === "history-failure") return route.fulfill({ status: 503, body: "Unavailable" });
      if (path.endsWith("/uptimes/30d")) return route.fulfill({ body: mode === "blank-uptime" ? " \n\t" : "1" });
      return route.fulfill({ json: { ...endpoint, events: [{ type: "START", timestamp }, { type: "HEALTHY", timestamp }] } });
    });
    await app.open("/status");
    if (mode === "current-failure" || mode === "invalid-current") {
      await expect(screen.getByRole("heading", "Current data could not be refreshed")).toBeVisible();
      await expect(screen.getByRole("link", "Akron home")).toBeVisible();
    } else {
      await expect(screen.getByRole("heading", (mode === "degraded" || mode === "network-outage") ? "Some monitored systems are degraded" : "All monitored systems are operational")).toBeVisible();
      await expect(screen.getByRole("heading", "Website")).toBeVisible();
      await expect(screen.getByRole("heading", "Scheduled test notice")).toBeVisible();
      await expect(screen.getByText("Resolved test incident")).toBeVisible();
      if (mode === "history-failure" || mode === "blank-uptime") await expect(screen.getByText("History unavailable")).toBeVisible();
    }
    await screen.getByRole("link", "Akron home").click();
    await expect(screen.getByRole("link", "Download")).toBeVisible();
  });
}
