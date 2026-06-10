const gamebananaModId = "681169";
const gamebananaFallbackFileId = "1725224";
const gamebananaFilesApiUrl =
  `https://api.gamebanana.com/Core/Item/Data?itemtype=Mod&itemid=${gamebananaModId}` +
  "&fields=Files().aFiles()&return_keys=1&format=json_min&flags=JSON_UNESCAPED_SLASHES";

async function loadLatestGamebananaFileId() {
  const response = await fetch(gamebananaFilesApiUrl);

  if (!response.ok) {
    throw new Error(`GameBanana API returned ${response.status}`);
  }

  const payload = await response.json();
  const files = payload["Files().aFiles()"] ?? {};
  let latestFileId = null;
  let latestTimestamp = Number.NEGATIVE_INFINITY;

  for (const file of Object.values(files)) {
    const timestamp = Number(file?._tsDateAdded);
    const isInstallable =
      !file?._bIsArchived &&
      Number.isFinite(timestamp) &&
      file?._sAnalysisResult !== "failed" &&
      file?._sAvResult !== "infected";

    if (isInstallable && timestamp > latestTimestamp) {
      latestFileId = String(file._idRow);
      latestTimestamp = timestamp;
    }
  }

  return latestFileId ?? gamebananaFallbackFileId;
}

export async function resolveOlympusInstallUrl() {
  const fileId = await loadLatestGamebananaFileId();
  return `everest:https://gamebanana.com/mmdl/${fileId},Mod,${gamebananaModId}`;
}

export async function resolveRawDownloadUrl() {
  const fileId = await loadLatestGamebananaFileId();
  return `https://gamebanana.com/dl/${fileId}`;
}
