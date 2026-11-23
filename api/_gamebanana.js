const releaseTag = "v1.0.0";
const releaseAssetUrl = `https://github.com/Microck/akron/releases/download/${releaseTag}/Akron-${releaseTag}.zip`;

export function resolveOlympusInstallUrl() {
  return `everest:${releaseAssetUrl}`;
}

export function resolveRawDownloadUrl() {
  return releaseAssetUrl;
}
