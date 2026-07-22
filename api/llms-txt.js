const LLMS_TEXT = `# Akron

> Akron is a Celeste mod with downloads, setup guidance, documentation, and community resources.

## Primary resources

- [Website](https://akron.micr.dev/): Project landing page and download links.
- [Documentation](https://akron.micr.dev/docs): Akron documentation.
- [Installation](https://akron.micr.dev/getting-started/install): Installation guide.
- [Troubleshooting](https://akron.micr.dev/troubleshooting/common-issues): Common issues and fixes.
`;

export default async function handler(_req, res) {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
  res.status(200).send(LLMS_TEXT);
}
