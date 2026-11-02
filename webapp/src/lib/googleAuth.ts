import crypto from "crypto";

export type AppRole = "VIEWER" | "RESEARCHER" | "OPERATOR" | "ADMIN";

export interface AuthenticatedUser {
  email: string;
  name: string;
  picture: string;
  role: AppRole;
  permissions: string[];
  mcpApiToken: string;
  mcpInteractiveAllowed: boolean;
  isFirstUser: boolean;
  loginAt: string;
}

export const SESSION_COOKIE_NAME = "skillvalue_google_session";

export const ROLE_PERMISSIONS_MAP: Record<AppRole, string[]> = {
  VIEWER: [
    "valuation:estimate",
    "pyramid:view",
    "dashboard:summary",
    "mcp:personal_valuation",
  ],
  RESEARCHER: [
    "valuation:estimate",
    "pyramid:view",
    "dashboard:summary",
    "data:explore_verified_links",
    "data:query_econometrics",
    "data:export_silver_gold",
    "audit:read_reports",
    "mcp:personal_valuation",
    "mcp:query_interactive",
    "mcp:query_econometrics",
  ],
  OPERATOR: [
    "valuation:estimate",
    "pyramid:view",
    "dashboard:summary",
    "data:explore_verified_links",
    "data:query_econometrics",
    "data:export_silver_gold",
    "audit:read_reports",
    "scraper:trigger_once",
    "scraper:trigger_backfill",
    "framework:run_audit",
    "ml:trigger_retrain",
    "mcp:personal_valuation",
    "mcp:query_interactive",
    "mcp:query_econometrics",
    "mcp:trigger_operations",
  ],
  ADMIN: [
    "valuation:estimate",
    "pyramid:view",
    "dashboard:summary",
    "data:explore_verified_links",
    "data:query_econometrics",
    "data:export_silver_gold",
    "data:export_raw_bronze",
    "audit:read_reports",
    "scraper:trigger_once",
    "scraper:trigger_backfill",
    "scraper:manage_daemon",
    "framework:run_audit",
    "framework:approve_restructure",
    "ml:trigger_retrain",
    "users:manage_roles",
    "system:configure_portals",
    "mcp:personal_valuation",
    "mcp:query_interactive",
    "mcp:query_econometrics",
    "mcp:trigger_operations",
    "mcp:admin_manage_users",
  ],
};

let hasRecordedFirstLoginInProcess = false;

export function resolveRequestOrigin(req: {
  headers: { get(name: string): string | null };
  nextUrl?: { origin: string };
}): string {
  const forwardedHost = req.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const host = forwardedHost || req.headers.get("host")?.split(",")[0]?.trim();
  const forwardedProto = req.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();

  if (host) {
    const isLocal =
      host.startsWith("localhost") ||
      host.startsWith("127.0.0.1") ||
      host.startsWith("0.0.0.0");
    const proto = forwardedProto || (isLocal ? "http" : "https");
    return `${proto}://${host}`;
  }

  return req.nextUrl?.origin || "http://localhost:3359";
}

export function getGoogleOAuthConfig(requestOrigin?: string) {
  const clientId =
    process.env.GOOGLE_CLIENT_ID ||
    "1062101941449-3igjpomkk1pmqg3itctcb4go70t5mmom.apps.googleusercontent.com";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";

  const envUrl = (
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    ""
  ).trim();

  const isEnvLocal =
    !envUrl ||
    envUrl.includes("localhost") ||
    envUrl.includes("127.0.0.1") ||
    envUrl.includes("0.0.0.0");

  const isReqLocal =
    !requestOrigin ||
    requestOrigin.includes("localhost") ||
    requestOrigin.includes("127.0.0.1") ||
    requestOrigin.includes("0.0.0.0");

  // Ưu tiên origin thực tế từ tên miền public
  // ngay cả khi biến môi trường .env vẫn để mặc định http://localhost:3359
  const rawBaseUrl = !isReqLocal
    ? requestOrigin!
    : !isEnvLocal
    ? envUrl
    : requestOrigin || envUrl || "http://localhost:3359";

  const baseUrl = rawBaseUrl.replace(/\/$/, "");
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI?.trim() ||
    `${baseUrl}/api/auth/callback/google`;

  return { clientId, clientSecret, baseUrl, redirectUri };
}

export function resolveConfiguredAdminEmails(): string[] {
  const multi = (
    process.env.ADMIN_EMAILS ||
    "phungtuananh3333@gmail.com,phungtuananh2222@gmail.com"
  ).trim();
  if (multi) {
    return Array.from(
      new Set(
        multi
          .split(",")
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean)
      )
    );
  }
  const single = (process.env.ADMIN_EMAIL || "phungtuananh3333@gmail.com")
    .trim()
    .toLowerCase();
  return single ? [single] : [];
}

function generateLocalMcpToken(email: string): string {
  const hash = crypto
    .createHash("sha256")
    .update(`${email}::${getSecretKey()}`)
    .digest("hex")
    .slice(0, 24);
  return `skv_mcp_${hash}`;
}

export async function resolveUserRoleAndSyncBackend(profile: {
  email: string;
  name?: string;
  picture?: string;
  sub?: string;
}): Promise<AuthenticatedUser> {
  const normEmail = profile.email.trim().toLowerCase();
  const adminEmails = resolveConfiguredAdminEmails();
  const isWhitelistedAdmin = adminEmails.includes(normEmail);
  const isAcademicEmail = normEmail.endsWith(".edu.vn");

  // Chỉ cấp quyền ADMIN cho email nằm trong danh sách ADMIN_EMAILS đã cấu hình
  // (Chỉ dùng first-login auto-admin khi hệ thống chưa khai báo bất kỳ ADMIN_EMAILS nào)
  let isFirst = !hasRecordedFirstLoginInProcess && adminEmails.length === 0;
  let assignedRole: AppRole =
    isWhitelistedAdmin || isFirst
      ? "ADMIN"
      : isAcademicEmail
      ? "RESEARCHER"
      : "VIEWER";
  let mcpToken = generateLocalMcpToken(normEmail);

  const apiUrl =
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:8000";
  try {
    const syncRes = await fetch(`${apiUrl}/api/v1/auth/google-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: normEmail,
        full_name: profile.name || "",
        avatar_url: profile.picture || "",
        google_sub: profile.sub || "",
      }),
    });
    if (syncRes.ok) {
      const dbUser = await syncRes.json();
      if (dbUser.role && dbUser.role in ROLE_PERMISSIONS_MAP) {
        assignedRole = dbUser.role as AppRole;
      }
      if (typeof dbUser.is_first_user === "boolean") {
        isFirst = dbUser.is_first_user;
      }
      if (dbUser.mcp_api_token) {
        mcpToken = dbUser.mcp_api_token;
      }
    }
  } catch {
    // Fallback an toàn khi chạy độc lập
  }

  hasRecordedFirstLoginInProcess = true;
  const perms = ROLE_PERMISSIONS_MAP[assignedRole];

  return {
    email: normEmail,
    name: profile.name || normEmail.split("@")[0],
    picture: profile.picture || "",
    role: assignedRole,
    permissions: perms,
    mcpApiToken: mcpToken,
    mcpInteractiveAllowed: perms.includes("mcp:query_interactive"),
    isFirstUser: isFirst,
    loginAt: new Date().toISOString(),
  };
}

function getSecretKey(): string {
  return (
    process.env.AUTH_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET ||
    "skillvalue_google_oauth_hmac_secret_2026"
  );
}

export function signSessionToken(user: AuthenticatedUser): string {
  const payloadB64 = Buffer.from(JSON.stringify(user), "utf-8").toString(
    "base64url"
  );
  const sig = crypto
    .createHmac("sha256", getSecretKey())
    .update(payloadB64)
    .digest("base64url");
  return `${payloadB64}.${sig}`;
}

export function verifySessionToken(
  token?: string | null
): AuthenticatedUser | null {
  if (!token || !token.includes(".")) return null;
  const [payloadB64, sig] = token.split(".", 2);
  const expectedSig = crypto
    .createHmac("sha256", getSecretKey())
    .update(payloadB64)
    .digest("base64url");
  if (sig !== expectedSig) return null;
  try {
    return JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf-8")
    ) as AuthenticatedUser;
  } catch {
    return null;
  }
}

export function getSessionUserFromRequest(req: {
  cookies: { get(name: string): { value: string } | undefined };
}): AuthenticatedUser | null {
  const token =
    req.cookies.get(SESSION_COOKIE_NAME)?.value ||
    req.cookies.get("skv_session")?.value ||
    "";
  return verifySessionToken(token);
}
