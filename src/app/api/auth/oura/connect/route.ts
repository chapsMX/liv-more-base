import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  const fidParam    = req.nextUrl.searchParams.get("fid");
  const userIdParam = req.nextUrl.searchParams.get("userId");

  if (!fidParam && !userIdParam) {
    return NextResponse.json({ error: "Missing fid or userId" }, { status: 400 });
  }

  const clientId = process.env.OURA_CLIENT_ID;
  const redirectUri =
    process.env.OURA_REDIRECT_URI ||
    `${process.env.NEXT_PUBLIC_URL || "https://app.livmore.life"}/api/auth/oura/callback`;

  if (!clientId || !redirectUri) {
    console.error("[oura connect] Missing OURA_CLIENT_ID or OURA_REDIRECT_URI");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const state = crypto.randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "daily",
    state,
  });

  const res = NextResponse.redirect(
    `https://cloud.ouraring.com/oauth/authorize?${params}`,
    302
  );

  res.cookies.set("oura_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10,
    path: "/",
  });

  // Guardar fid o userId según lo que tengamos
  if (fidParam) {
    res.cookies.set("oura_oauth_fid", fidParam, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 10,
      path: "/",
    });
  } else {
    res.cookies.set("oura_oauth_userid", userIdParam!, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 10,
      path: "/",
    });
  }

  return res;
}
