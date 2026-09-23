const releaseTag = "v0.1.2-beta.82";
const releaseAssetUrl = `https://github.com/Microck/akron/releases/download/${releaseTag}/Akron-${releaseTag}.zip`;

export function resolveOlympusInstallUrl() {
  return `everest:${releaseAssetUrl}`;
}

export function resolveRawDownloadUrl() {
  return releaseAssetUrl;
}
