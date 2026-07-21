const MINTLIFY_ORIGIN = "https://akron-cdb9eaf4.mintlify.app";
const CANONICAL_ORIGIN = "https://akron.micr.dev";
const LANDING_PAGE = `<url><loc>${CANONICAL_ORIGIN}/</loc></url>`;

export default async function handler(_req, res) {
  try {
    const upstream = await fetch(`${MINTLIFY_ORIGIN}/sitemap.xml`);
    if (!upstream.ok) {
      res.status(upstream.status).end();
      return;
    }

    let body = (await upstream.text()).replaceAll(MINTLIFY_ORIGIN, CANONICAL_ORIGIN);
    if (!body.includes("<urlset")) {
      res.status(502).end();
      return;
    }

    if (!body.includes(`<loc>${CANONICAL_ORIGIN}/</loc>`)) {
      body = body.replace(/(<urlset[^>]*>)/, `$1\n  ${LANDING_PAGE}`);
    }

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
    res.status(200).send(body);
  } catch {
    res.status(502).end();
  }
}
