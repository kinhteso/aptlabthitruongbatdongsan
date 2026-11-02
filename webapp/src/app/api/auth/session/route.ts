import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  getGoogleOAuthConfig,
  resolveConfiguredAdminEmails,
  resolveRequestOrigin,
  resolveUserRoleAndSyncBackend,
  SESSION_COOKIE_NAME,
  setRuntimeOAuthOverrides,
  signSessionToken,
  verifySessionToken,
} from "@/lib/googleAuth";

function getConfiguredAccessPassword(): string {
  return (
    process.env.ADMIN_PASSWORD ||
    process.env.LAB_ACCESS_PASSWORD ||
    process.env.POSTGRES_PASSWORD ||
    "skillvalue_secret_2026"
  ).trim();
}

function safeComparePassword(input: string, expected: string): boolean {
  const a = Buffer.from(input, "utf-8");
  const b = Buffer.from(expected, "utf-8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const user = verifySessionToken(token);
  const origin = resolveRequestOrigin(req);
  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig(origin);

  const apiUrl =
    process.env.INTERNAL_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:8000";
  let registeredUsers: Array<{
    email: string;
    full_name?: string;
    avatar_url?: string;
    role: string;
    mcp_api_token?: string;
    last_login_at?: string;
  }> = [];
  try {
    const uRes = await fetch(`${apiUrl}/api/v1/auth/users`, {
      cache: "no-store",
    });
    if (uRes.ok) {
      const uData = await uRes.json();
      if (Array.isArray(uData?.users)) {
        registeredUsers = uData.users;
      }
    }
  } catch {
    // Ignore when backend is offline
  }

  return NextResponse.json({
    authenticated: Boolean(user),
    user,
    oauth_config: {
      default_port: 3359,
      google_client_id: clientId,
      has_client_secret: Boolean(clientSecret),
      redirect_uri: redirectUri,
      admin_emails: resolveConfiguredAdminEmails(),
      first_login_auto_admin: true,
    },
    registered_users: registeredUsers,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = (body?.email || "").trim().toLowerCase();
    const password = (body?.password || "").trim();

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { authenticated: false, error: "Vui lòng nhập địa chỉ email hợp lệ." },
        { status: 400 }
      );
    }

    if (!password) {
      return NextResponse.json(
        {
          authenticated: false,
          error: "Vui lòng nhập mật khẩu bảo mật để xác thực.",
        },
        { status: 401 }
      );
    }

    const expectedPassword = getConfiguredAccessPassword();
    if (!safeComparePassword(password, expectedPassword)) {
      return NextResponse.json(
        {
          authenticated: false,
          error: "Mật khẩu bảo mật không chính xác. Từ chối truy cập!",
        },
        { status: 401 }
      );
    }

    // Kiểm tra email có nằm trong danh sách được phép truy cập hay không
    const adminEmails = resolveConfiguredAdminEmails();
    const researcherEmails = (process.env.RESEARCHER_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const isAllowedEmail =
      adminEmails.includes(email) ||
      researcherEmails.includes(email) ||
      email.endsWith(".edu.vn");

    if (!isAllowedEmail) {
      return NextResponse.json(
        {
          authenticated: false,
          error:
            "Email này chưa được cấp quyền trong danh sách Quản trị / Nghiên cứu của Lab.",
        },
        { status: 403 }
      );
    }

    const authUser = await resolveUserRoleAndSyncBackend({
      email,
      name: body?.name || email.split("@")[0],
    });

    const signedToken = signSessionToken(authUser);
    const isHttps = resolveRequestOrigin(req).startsWith("https://");
    const res = NextResponse.json({ authenticated: true, user: authUser });
    res.cookies.set(SESSION_COOKIE_NAME, signedToken, {
      httpOnly: true,
      secure: isHttps,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  } catch {
    return NextResponse.json(
      { authenticated: false, error: "Yêu cầu xác thực không hợp lệ." },
      { status: 400 }
    );
  }
}

export async function PUT(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const user = verifySessionToken(token);
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Chỉ tài khoản ADMIN mới được phép cập nhật cấu hình Google OAuth & RBAC." },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    if (body?.action === "update_oauth_config") {
      setRuntimeOAuthOverrides({
        clientId: body.google_client_id?.trim() || undefined,
        clientSecret: body.google_client_secret?.trim() || undefined,
        redirectUri: body.redirect_uri?.trim() || undefined,
        adminEmails: body.admin_emails?.trim() || undefined,
      });
      const origin = resolveRequestOrigin(req);
      const cfg = getGoogleOAuthConfig(origin);
      return NextResponse.json({
        status: "updated",
        oauth_config: {
          default_port: 3359,
          google_client_id: cfg.clientId,
          has_client_secret: Boolean(cfg.clientSecret),
          redirect_uri: cfg.redirectUri,
          admin_emails: resolveConfiguredAdminEmails(),
        },
      });
    }

    if (body?.action === "update_user_role" && body?.target_email && body?.new_role) {
      const apiUrl =
        process.env.INTERNAL_API_URL ||
        process.env.NEXT_PUBLIC_API_URL ||
        "http://localhost:8000";
      const r = await fetch(`${apiUrl}/api/v1/auth/users/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_email: body.target_email,
          new_role: body.new_role,
        }),
      });
      const data = await r.json().catch(() => ({}));
      return NextResponse.json(data, { status: r.ok ? 200 : 400 });
    }

    return NextResponse.json({ error: "Hành động không hợp lệ." }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Lỗi xử lý yêu cầu." }, { status: 400 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ authenticated: false, user: null });
  res.cookies.delete(SESSION_COOKIE_NAME);
  return res;
}
