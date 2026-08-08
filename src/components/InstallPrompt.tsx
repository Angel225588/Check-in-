"use client";
import { useEffect, useState } from "react";
import { DeviceMobile, Export, X } from "@phosphor-icons/react/dist/ssr";

const DISMISSED = "installPromptDismissed";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Offer to install, once, and only when it would actually help.
 *
 * In Safari the browser chrome and tab bar cost about 200px of a screen that is
 * already tight at 07:40 — installing gets them back. iOS has no programmatic
 * install, so there it can only show the two taps; Chrome gets a real button.
 *
 * Never shown to someone already running installed, and never shown twice.
 */
export default function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS reports it here rather than through display-mode.
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;
    if (localStorage.getItem(DISMISSED) === "1") return;

    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      // iPadOS 13+ reports itself as a Mac; the touch points give it away.
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIos(isIos);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // iOS never fires that event, so decide from the platform instead.
    if (isIos) setShow(true);

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!show) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISSED, "1");
    setShow(false);
  };

  return (
    <div
      data-role="install-prompt"
      /* Top, not bottom. At the bottom it sat squarely on the keypad — on the
         iPad in portrait it covered the whole last row, so the one screen that
         tells you to install the app is the screen where the app stops working.
         Nothing may occupy the dock's band except the dock. */
      className="fixed top-3 left-1/2 -translate-x-1/2 z-[80] w-[min(560px,calc(100vw-32px))] rounded-[20px] px-5 py-4 flex items-center gap-4 animate-[cardIn_.3s_cubic-bezier(.2,.9,.25,1)]"
      style={{
        background: "var(--aur-bg-elev)",
        boxShadow: "0 24px 60px -20px rgba(20,12,0,.55), inset 0 0 0 1px var(--aur-hairline)",
      }}
    >
      <span
        className="w-11 h-11 shrink-0 rounded-full grid place-items-center"
        style={{ background: "var(--aur-gold-soft-2)" }}
      >
        <DeviceMobile weight="duotone" size={22} style={{ color: "var(--brand-ink)" }} />
      </span>

      <div className="flex-1 min-w-0">
        <div className="text-[14.5px] font-black" style={{ color: "var(--brand-ink)" }}>
          Installer l&apos;app
        </div>
        <div className="text-[12.5px] font-semibold leading-snug" style={{ color: "var(--tab-idle)" }}>
          {ios ? (
            <>
              Dans <b style={{ color: "var(--aur-ink-2)" }}>Safari</b> :{" "}
              <Export weight="bold" size={13} className="inline -mt-0.5" /> Partager →{" "}
              <b style={{ color: "var(--aur-ink-2)" }}>Sur l&apos;écran d&apos;accueil</b>.
              {" "}Les autres navigateurs iOS (Brave, Chrome) n&apos;ont pas cette option.
            </>
          ) : (
            "Plein écran, sans la barre du navigateur."
          )}
        </div>
      </div>

      {!ios && deferred && (
        <button
          onClick={async () => {
            await deferred.prompt();
            await deferred.userChoice.catch(() => null);
            dismiss();
          }}
          data-role="install-accept"
          className="shrink-0 min-h-[44px] px-4 rounded-full text-white text-[13.5px] font-black active:scale-[0.97] transition-transform"
          style={{ background: "var(--color-brand)" }}
        >
          Installer
        </button>
      )}

      <button
        onClick={dismiss}
        aria-label="Plus tard"
        className="shrink-0 w-11 h-11 rounded-full grid place-items-center active:scale-[0.94] transition-transform"
      >
        <X size={15} weight="bold" style={{ color: "var(--tab-idle)" }} />
      </button>
    </div>
  );
}
