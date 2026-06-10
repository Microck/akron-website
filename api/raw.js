import { resolveRawDownloadUrl } from "./_gamebanana.js";

export default async function handler(_req, res) {
  const location = await resolveRawDownloadUrl();
  res.writeHead(307, {
    Location: location,
    "Cache-Control": "no-store",
  });
  res.end();
}
