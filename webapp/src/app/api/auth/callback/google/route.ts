import { NextRequest, NextResponse } from "next/server";
import {
  getGoogleOAuthConfig,
  resolveRequestOrigin,
  resolveUserRoleAndSyncBackend,
  SESSION_COOKIE_NAME,
  signSessionToken,
} from "@/lib/googleAuth";

export async function GET(req: NextRequest) {
  const origin = resolveRequestOrigin(req);
  const code = req.nextUrl.searchParams.get("code");
  const googleError = req.nextUrl.searchParams.get("error");
  const { clientId, clientSecret, baseUrl, redirectUri } =
    getGoogleOAuthConfig(origin);

  if (googleError) {
    return NextResponse.redirect(
      `${baseUrl}/?auth_error=${encodeURIComponent(googleError)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(`${baseUrl}/?auth_error=missing_code`);
  }

  try {
    // 1. Đổi Authorization Code lấy Access Token từ Google OAuth 2.0
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!tokenRes.ok) {
      return NextResponse.redirect(`${baseUrl}/?auth_error=token_exchange_failed`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 2. Lấy thông tin hồ sơ người dùng từ Google OpenID UserInfo
    const userRes = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!userRes.ok) {
      return NextResponse.redirect(`${baseUrl}/?auth_error=userinfo_failed`);
    }

    const profile = await userRes.json();

    // 3. Phân quyền ADMIN (Email đầu tiên login HOẶC nằm trong ADMIN_EMAILS / ADMIN_EMAIL) & lưu vào PostgreSQL
    const authUser = await resolveUserRoleAndSyncBackend({
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
      sub: profile.sub,
    });

    // 4. Ký HMAC Session Cookie và chuyển hướng vào Trang trong (/workspace) sau khi login
    const signedToken = signSessionToken(authUser);
    const stateTab = req.nextUrl.searchParams.get("state") || "";
    const workspaceDest = stateTab
      ? `${baseUrl}/workspace?tab=${encodeURIComponent(stateTab)}`
      : `${baseUrl}/workspace`;
    const response = NextResponse.redirect(workspaceDest);
    response.cookies.set(SESSION_COOKIE_NAME, signedToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: baseUrl.startsWith("https://"),
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 ngày
    });
    return response;
  } catch {
    return NextResponse.redirect(`${baseUrl}/?auth_error=oauth_exception`);
  }
}
