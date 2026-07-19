const MINTLIFY_ORIGIN = "https://akron-cdb9eaf4.mintlify.app";
const CANONICAL_ORIGIN = "https://akron.micr.dev";

export default async function handler(_req, res) {
  try {
    const upstream = await fetch(`${MINTLIFY_ORIGIN}/llms.txt`);
    if (!upstream.ok) {
      res.status(upstream.status).end();
      return;
    }
    let body = await upstream.text();
    // Rewrite all Mintlify subdomain URLs to the canonical domain.
    body = body.replaceAll(MINTLIFY_ORIGIN, CANONICAL_ORIGIN);

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
    res.status(200).send(body);
  } catch {
    res.status(502).end();
  }
}
