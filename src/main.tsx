import { StrictMode, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import preloaderLogoSvg from "./assets/preloader-logo.svg?raw";
import "./styles.css";

const preloaderLogoMarkup = preloaderLogoSvg
  .replace(/<\?xml[^>]*>\s*/u, "")
  .replace(/<!DOCTYPE[^>]*>\s*/u, "");

const gamebananaModId = "681169";
const gamebananaFallbackFileId = "1715650";
const gamebananaModUrl = `https://gamebanana.com/mods/${gamebananaModId}`;
const gamebananaFilesApiUrl =
  `https://api.gamebanana.com/Core/Item/Data?itemtype=Mod&itemid=${gamebananaModId}` +
  "&fields=Files().aFiles()&return_keys=1&format=json_min&flags=JSON_UNESCAPED_SLASHES";

type GamebananaFile = Readonly<{
  _idRow: string | number;
  _tsDateAdded: string | number;
  _bIsArchived: boolean;
  _sAnalysisResult?: string;
  _sAvResult?: string;
}>;

type GamebananaFilesResponse = Readonly<{
  "Files().aFiles()"?: Record<string, GamebananaFile>;
}>;

function getDownloadUrl(fileId: string) {
  return `https://gamebanana.com/dl/${fileId}`;
}

function getOlympusInstallUrl(fileId: string) {
  return `everest:https://gamebanana.com/mmdl/${fileId},Mod,${gamebananaModId}`;
}

function selectLatestGamebananaFileId(files: Record<string, GamebananaFile>) {
  let latestFile: GamebananaFile | null = null;
  let latestTimestamp = Number.NEGATIVE_INFINITY;

  for (const file of Object.values(files)) {
    const timestamp = Number(file._tsDateAdded);
    const isInstallable =
      !file._bIsArchived &&
      Number.isFinite(timestamp) &&
      file._sAnalysisResult !== "failed" &&
      file._sAvResult !== "infected";

    if (isInstallable && timestamp > latestTimestamp) {
      latestFile = file;
      latestTimestamp = timestamp;
    }
  }

  return latestFile ? String(latestFile._idRow) : null;
}

type OrbitLink = Readonly<{
  href: string;
  label: string;
  asset: string;
  className: string;
}>;

const orbitLinks: OrbitLink[] = [
  {
    href: "/docs",
    label: "Docs",
    asset: "/assets/docs-icon.png",
    className: "orbit-item orbit-item-top",
  },
  {
    href: "/discord",
    label: "Discord",
    asset: "/assets/discord-icon.png",
    className: "orbit-item orbit-item-right",
  },
  {
    href: gamebananaModUrl,
    label: "GameBanana",
    asset: "/assets/gamebanana-icon.png",
    className: "orbit-item orbit-item-bottom",
  },
  {
    href: "https://github.com/Microck/Akron",
    label: "GitHub",
    asset: "/assets/github-icon.png",
    className: "orbit-item orbit-item-left",
  },
];

function FlipText({ text }: Readonly<{ text: string }>) {
  return (
    <span className="flip-text" aria-hidden="true">
      {Array.from(text).map((letter, index) => (
        <span
          className="flip-letter"
          style={{ "--letter-index": index } as CSSProperties}
          key={`${letter}-${index}`}
        >
          <span className="flip-letter-face flip-letter-front">{letter}</span>
          <span className="flip-letter-face flip-letter-back">{letter}</span>
        </span>
      ))}
    </span>
  );
}

function Preloader({ isDone }: Readonly<{ isDone: boolean }>) {
  return (
    <div
      className={`preloader${isDone ? " preloader-done" : ""}`}
      aria-hidden="true"
    >
      <div className="preloader-mark" aria-hidden="true">
        <div
          className="preloader-logo preloader-logo-outline"
          dangerouslySetInnerHTML={{ __html: preloaderLogoMarkup }}
        />
        <div
          className="preloader-logo preloader-logo-fill"
          dangerouslySetInnerHTML={{ __html: preloaderLogoMarkup }}
        />
      </div>
    </div>
  );
}

function AkronLandingPage() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [gamebananaFileId, setGamebananaFileId] = useState(
    gamebananaFallbackFileId,
  );

  useEffect(() => {
    let hasWindowLoaded = document.readyState === "complete";
    let hasMinimumRun = false;
    let isCancelled = false;

    const finishIfReady = () => {
      if (!isCancelled && hasWindowLoaded && hasMinimumRun) {
        setIsLoaded(true);
      }
    };

    const handleWindowLoad = () => {
      hasWindowLoaded = true;
      finishIfReady();
    };

    const minimumRunTimer = window.setTimeout(() => {
      hasMinimumRun = true;
      finishIfReady();
    }, 2100);

    if (hasWindowLoaded) {
      finishIfReady();
    } else {
      window.addEventListener("load", handleWindowLoad, { once: true });
    }

    return () => {
      isCancelled = true;
      window.clearTimeout(minimumRunTimer);
      window.removeEventListener("load", handleWindowLoad);
    };
  }, []);

  useEffect(() => {
    const abortController = new AbortController();

    async function updateLatestGamebananaFile() {
      const response = await fetch(gamebananaFilesApiUrl, {
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`GameBanana API returned ${response.status}`);
      }

      const payload = (await response.json()) as GamebananaFilesResponse;
      const latestFileId = selectLatestGamebananaFileId(
        payload["Files().aFiles()"] ?? {},
      );

      if (latestFileId) {
        setGamebananaFileId(latestFileId);
      }
    }

    updateLatestGamebananaFile().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      console.warn("Unable to load the latest GameBanana file.", error);
    });

    return () => {
      abortController.abort();
    };
  }, []);

  return (
    <main
      className={`landing-shell${isLoaded ? " landing-shell-ready" : ""}`}
      aria-label="Akron landing page"
    >
      <Preloader isDone={isLoaded} />

      <section className="orbit-stage" aria-label="Akron links">
        <div className="orbit-safe-zone" aria-hidden="true" />

        <img
          className="akron-logo-layer akron-logo-lower"
          src="/assets/akron-logo.png"
          alt=""
          draggable="false"
        />

        <div className="orbit-system">
          {orbitLinks.map((link) => (
            <a
              className={link.className}
              href={link.href}
              aria-label={link.label}
              title={link.label}
              key={link.label}
            >
              <span className="orbit-icon-frame">
                <img
                  src={link.asset}
                  alt=""
                  draggable="false"
                />
              </span>
            </a>
          ))}
        </div>

        <img
          className="akron-logo-layer akron-logo-upper"
          src="/assets/akron-logo.png"
          alt="Akron"
          draggable="false"
        />

        <div className="brand-lockup">
          <div className="logo-spacer" aria-hidden="true" />
          <div className="install-actions" aria-label="Install options">
            <a
              className="install-button"
              href={getDownloadUrl(gamebananaFileId)}
              aria-label="Download"
            >
              <span className="sr-only">Download</span>
              <FlipText text="Download" />
            </a>
            <a
              className="install-button"
              href={getOlympusInstallUrl(gamebananaFileId)}
              aria-label="Olympus"
            >
              <span className="sr-only">Olympus</span>
              <FlipText text="Olympus" />
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AkronLandingPage />
  </StrictMode>,
);
