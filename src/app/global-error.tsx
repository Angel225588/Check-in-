"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body style={{ margin: 0, fontFamily: "'Nunito', -apple-system, sans-serif", background: "#FBF8F3", color: "#1C1C1C" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100dvh", padding: "24px" }}>
          <div style={{ maxWidth: 360, width: "100%", textAlign: "center", background: "rgba(255,253,248,0.7)", backdropFilter: "blur(40px)", borderRadius: 20, padding: 32, border: "1px solid rgba(255,250,240,0.6)" }}>
            <div style={{ width: 56, height: 56, margin: "0 auto 16px", borderRadius: "50%", background: "rgba(208,2,27,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#D0021B" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>Erreur critique</h2>
            <p style={{ fontSize: 14, color: "#707070", margin: "0 0 24px" }}>
              {error.message || "L'application a rencontré une erreur inattendue."}
            </p>
            <button
              onClick={reset}
              style={{ width: "100%", padding: "12px 0", borderRadius: 52, background: "linear-gradient(90deg, #A66914, #DD9C28)", color: "#fff", fontWeight: 700, fontSize: 15, border: "none", cursor: "pointer" }}
            >
              Réessayer
            </button>
            <button
              onClick={() => window.location.href = "/"}
              style={{ width: "100%", padding: "12px 0", borderRadius: 52, background: "transparent", color: "#A66914", fontWeight: 700, fontSize: 15, border: "1px solid rgba(166,105,20,0.3)", cursor: "pointer", marginTop: 8 }}
            >
              Accueil
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
