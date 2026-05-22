import { StrictMode } from "react";
import type { CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

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
    href: "/gamebanana",
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

function AkronLandingPage() {
  return (
    <main className="landing-shell" aria-label="Akron landing page">
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
              href="/download"
              aria-label="Download"
            >
              <span className="sr-only">Download</span>
              <FlipText text="Download" />
            </a>
            <a
              className="install-button"
              href="/olympus"
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
