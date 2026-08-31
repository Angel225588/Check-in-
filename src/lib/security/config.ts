/**
 * Security policy for every route under /api — one table, one source of truth.
 *
 * Middleware, the upload guard and the spend cap all read from here, so a
 * route cannot silently drift out of policy: a path with no entry makes
 * `getRoutePolicy` return null and the middleware denies it.
 *
 * This layer sits ON TOP of what main already does (same-origin gate, CSP
 * nonce, the timeouts/retry/token caps in src/lib/ai). It adds the parts that
 * were missing: a caller identity to meter against, per-route limits instead
 * of one blanket bucket, content-based file validation, and a spend ceiling.
 */

/** Upload types the app actually handles. Everything else is rejected. */
export const ALLOWED_UPLOAD_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AllowedUploadType = (typeof ALLOWED_UPLOAD_TYPES)[number];

/** Photo-capture routes: images only, no PDF. */
export const ALLOWED_IMAGE_TYPES: readonly AllowedUploadType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

export interface RateLimitTier {
  limit: number;
  windowMs: number;
}

/**
 * Worst-case provider work a single request can trigger, used to reserve
 * budget before spending. OCR bills per page; chat bills per token.
 */
export interface AiCost {
  /** Upper bound on OCR pages. */
  ocrPages: number;
  /** Upper bound on chat completions. */
  chatCalls: number;
}

export interface RoutePolicy {
  path: string;
  /**
   * There are no deliberately-public routes. The five OCR routes spend money;
   * the two privacy routes read and erase guest data.
   */
  public: boolean;
  /** Methods accepted; anything else is 405. */
  methods: string[];
  /** Does this route reach the AI provider? */
  callsAi: boolean;
  /** Worst-case provider work, for the budget reservation. */
  worstCase: AiCost;
  /** Hard ceiling on the body, enforced against real bytes. */
  maxBodyBytes: number;
  /** Upload types accepted, validated by magic bytes rather than by header. */
  allowedTypes: readonly AllowedUploadType[];
  perIdentity: RateLimitTier;
  perIp: RateLimitTier;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const MB = 1024 * 1024;

/**
 * Tiers are sized for real reception use — a handful of uploads per shift —
 * not for convenience. A low ceiling is the cheapest defence against a cost
 * incident, and replaces the single 30/min-per-IP bucket that all routes
 * previously shared regardless of what they cost.
 */
const IMAGE_TIER: RateLimitTier = { limit: 12, windowMs: 5 * MINUTE };
const PDF_TIER: RateLimitTier = { limit: 6, windowMs: 5 * MINUTE };
/** The brief is a once-a-day document, and it runs OCR *and* a chat call. */
const BRIEF_TIER: RateLimitTier = { limit: 4, windowMs: HOUR };
/** Erasure and export are rare, deliberate, human-initiated acts. */
const PRIVACY_TIER: RateLimitTier = { limit: 5, windowMs: HOUR };

/**
 * Hard ceiling on pages in one PDF. Counted locally with pdf-lib before a
 * single byte is sent, so an oversized document costs nothing to reject.
 * A breakfast roster runs 20-odd pages; 60 is generous.
 */
export const MAX_PDF_PAGES = 60;

/** Files accepted per morning-brief upload. */
export const MAX_BRIEF_FILES = 5;

/**
 * Entries accepted by /api/verify-extraction. They are serialised into the
 * prompt, so an unbounded array is an unbounded token bill.
 */
export const MAX_VERIFY_ENTRIES = 400;

export const ROUTE_POLICIES: RoutePolicy[] = [
  {
    path: "/api/ocr",
    public: false,
    methods: ["POST"],
    callsAi: true,
    worstCase: { ocrPages: 1, chatCalls: 0 },
    maxBodyBytes: 10 * MB,
    allowedTypes: ALLOWED_IMAGE_TYPES,
    perIdentity: IMAGE_TIER,
    perIp: { limit: 24, windowMs: 5 * MINUTE },
  },
  {
    path: "/api/ocr-unified",
    public: false,
    methods: ["POST"],
    callsAi: true,
    worstCase: { ocrPages: 1, chatCalls: 0 },
    maxBodyBytes: 10 * MB,
    allowedTypes: ALLOWED_IMAGE_TYPES,
    perIdentity: IMAGE_TIER,
    perIp: { limit: 24, windowMs: 5 * MINUTE },
  },
  {
    path: "/api/ocr-pdf",
    public: false,
    methods: ["POST"],
    callsAi: true,
    // Reserved from the real page count; this is only the ceiling.
    worstCase: { ocrPages: MAX_PDF_PAGES, chatCalls: 0 },
    maxBodyBytes: 20 * MB,
    allowedTypes: ["application/pdf"],
    perIdentity: PDF_TIER,
    perIp: { limit: 12, windowMs: 5 * MINUTE },
  },
  {
    path: "/api/ocr-morning-brief",
    public: false,
    methods: ["POST"],
    callsAi: true,
    // One OCR pass per file, then a single structured extraction.
    worstCase: { ocrPages: MAX_BRIEF_FILES, chatCalls: 1 },
    // One shared budget across all files, rather than 5 x the per-file cap —
    // that let five files total 100MB. Sized so it cannot reject a real
    // upload: five phone photos of a printed brief run 3-8MB each, so 25MB
    // total (the first cut) would have refused a legitimate five-page brief at
    // 06:30. 60MB keeps a real ceiling while leaving that headroom.
    maxBodyBytes: 60 * MB,
    allowedTypes: ALLOWED_UPLOAD_TYPES,
    perIdentity: BRIEF_TIER,
    perIp: { limit: 8, windowMs: HOUR },
  },
  {
    path: "/api/verify-extraction",
    public: false,
    methods: ["POST"],
    callsAi: true,
    worstCase: { ocrPages: MAX_PDF_PAGES, chatCalls: 1 },
    maxBodyBytes: 25 * MB,
    allowedTypes: ["application/pdf"],
    perIdentity: PDF_TIER,
    perIp: { limit: 12, windowMs: 5 * MINUTE },
  },
  {
    path: "/api/privacy/export",
    public: false,
    methods: ["POST"],
    callsAi: false,
    worstCase: { ocrPages: 0, chatCalls: 0 },
    maxBodyBytes: 64 * 1024,
    allowedTypes: [],
    perIdentity: PRIVACY_TIER,
    perIp: { limit: 10, windowMs: HOUR },
  },
  {
    path: "/api/privacy/erase",
    public: false,
    methods: ["POST"],
    callsAi: false,
    worstCase: { ocrPages: 0, chatCalls: 0 },
    maxBodyBytes: 64 * 1024,
    allowedTypes: [],
    perIdentity: PRIVACY_TIER,
    perIp: { limit: 10, windowMs: HOUR },
  },
];

/**
 * Enforcement mode — the lever to pull when a new limit misfires during
 * service.
 *
 * "observe" keeps every check running and logging, and rejects nothing: rate
 * limits, the spend cap and magic-byte validation all report what they *would*
 * have done. The structural gates stay on in both modes — method, same-origin,
 * unknown paths and the declared-size pre-check are not new behaviour and
 * cannot lock reception out of a document they could upload yesterday.
 *
 * Ship a new limit in observe, read a day of logs, then enforce. Changing this
 * is an environment variable, not a code change — on Vercel that is a redeploy
 * of about a minute, which is the fastest honest rollback available here.
 */
export type SecurityMode = "enforce" | "observe";

export function getSecurityMode(): SecurityMode {
  return process.env.SECURITY_MODE === "observe" ? "observe" : "enforce";
}

export function isObserveMode(): boolean {
  return getSecurityMode() === "observe";
}

export function getRoutePolicy(pathname: string): RoutePolicy | null {
  return ROUTE_POLICIES.find((p) => p.path === pathname) ?? null;
}

/**
 * Billing and tenancy scope — assigned automatically, never typed.
 *
 * Reception types nothing. `PROPERTY_CODE` wins when set (one hotel per
 * deployment, the explicit case); otherwise the code is derived from the host
 * the request arrived on, so a second hotel on its own domain gets its own
 * scope with no setup step and no code to lose.
 *
 * LIMIT, stated plainly: the Host header is client-controlled unless the
 * platform constrains it. Vercel only serves hosts configured for the project,
 * so derivation is safe there; a self-hosted deployment behind a permissive
 * proxy could be fed an arbitrary host and mint a fresh per-property budget.
 * The GLOBAL cap is the backstop that does not depend on the host, which is
 * why it exists as well as the per-property one. Set PROPERTY_CODE to remove
 * the question entirely.
 */
export function derivePropertyCode(host: string | null): string {
  if (!host) return "default";

  // Drop the port, lowercase, and take the left-most label: the deployment
  // name is what distinguishes one hotel from another.
  const hostname = host.split(":")[0].toLowerCase().trim();
  if (!hostname || hostname === "localhost") return "default";

  // An IP address carries no deployment identity.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return "default";

  const label = hostname.split(".")[0];

  // Vercel preview hosts look like "<project>-git-<branch>-<team>". Collapsing
  // them onto production would let a preview spend the hotel's budget, so they
  // keep their own scope — but the branch hash is stripped so that repeated
  // deploys of one branch share a scope rather than minting a new one daily.
  const preview = /^(.+?)-git-(.+?)-[a-z0-9]+$/.exec(label);
  const base = preview ? `${preview[1]}-preview-${preview[2]}` : label;

  const slug = base.replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").slice(0, 48);
  return slug || "default";
}

/** Billing and tenancy scope for this deployment. */
export function getPropertyCode(host?: string | null): string {
  const explicit = process.env.PROPERTY_CODE || process.env.NEXT_PUBLIC_PROPERTY_CODE;
  if (explicit) return explicit;
  return derivePropertyCode(host ?? null);
}
