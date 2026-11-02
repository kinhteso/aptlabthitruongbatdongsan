import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  getGoogleOAuthConfig,
  resolveConfiguredAdminEmails,
  resolveRequestOrigin,
  resolveUserRoleAndSyncBackend,
  SESSION_COOKIE_NAME,
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
  const { clientId, redirectUri } = getGoogleOAuthConfig(origin);

  return NextResponse.json({
    authenticated: Boolean(user),
    user,
    oauth_config: {
      default_port: 3358,
      google_client_id: clientId,
      redirect_uri: redirectUri,
      admin_emails: resolveConfiguredAdminEmails(),
      first_login_auto_admin: true,
    },
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

export async function DELETE() {
  const res = NextResponse.json({ authenticated: false, user: null });
  res.cookies.delete(SESSION_COOKIE_NAME);
  return res;
}
