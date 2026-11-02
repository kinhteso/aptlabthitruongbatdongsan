import { NextRequest, NextResponse } from "next/server";
import { getGoogleOAuthConfig, resolveRequestOrigin } from "@/lib/googleAuth";

export async function GET(req: NextRequest) {
  const origin = resolveRequestOrigin(req);
  const targetTab = req.nextUrl.searchParams.get("tab") || "";
  const { clientId, redirectUri } = getGoogleOAuthConfig(origin);

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "select_account");
  if (targetTab) {
    authUrl.searchParams.set("state", targetTab);
  }

  return NextResponse.redirect(authUrl.toString());
}
