import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

function toPublicUser(row: Record<string, unknown>) {
  return {
    id: row.id,
    fid: row.fid ? Number(row.fid) : null,
    username: row.username,
    display_name: row.display_name,
    basename: row.basename,
    eth_address: row.eth_address,
    created_at: row.created_at,
    updated_at: row.updated_at,
    provider: row.provider as "garmin" | "polar" | "oura" | "google" | null,
    og: Boolean(row.og),
    auth_type: row.auth_type as "farcaster" | "wallet",
  };
}

/** GET /api/user/wallet?address=0x... */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address")?.toLowerCase();

  if (!address) {
    return NextResponse.json({ success: false, error: "address is required" }, { status: 400 });
  }

  try {
    const rows = await sql`
      SELECT id, fid, username, display_name, basename, eth_address,
             created_at, updated_at, provider, og, auth_type
      FROM "2026_users"
      WHERE LOWER(eth_address) = ${address}
      LIMIT 1
    `;

    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, user: toPublicUser(rows[0]) });
  } catch (error) {
    console.error("[api/user/wallet] GET error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

/** POST /api/user/wallet — crea usuario de Base App */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { eth_address, display_name, basename } = body;

    if (!eth_address) {
      return NextResponse.json({ success: false, error: "eth_address is required" }, { status: 400 });
    }

    const address = eth_address.toLowerCase();

    const existing = await sql`
      SELECT id, fid, username, display_name, basename, eth_address,
             created_at, updated_at, provider, og, auth_type
      FROM "2026_users"
      WHERE LOWER(eth_address) = ${address}
      LIMIT 1
    `;

    if (existing.length > 0) {
      return NextResponse.json({ success: true, user: toPublicUser(existing[0]), created: false });
    }

    const inserted = await sql`
      INSERT INTO "2026_users"
        (eth_address, display_name, basename, auth_type)
      VALUES
        (${eth_address}, ${display_name ?? null}, ${basename ?? null}, 'wallet')
      RETURNING id, fid, username, display_name, basename, eth_address,
                created_at, updated_at, provider, og, auth_type
    `;

    return NextResponse.json({ success: true, user: toPublicUser(inserted[0]), created: true });
  } catch (error) {
    console.error("[api/user/wallet] POST error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

/** PATCH /api/user/wallet — vincular FID existente */
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { eth_address, fid } = body;

    if (!eth_address || !fid) {
      return NextResponse.json({ success: false, error: "eth_address and fid are required" }, { status: 400 });
    }

    const fidUser = await sql`
      SELECT id FROM "2026_users" WHERE fid = ${fid} LIMIT 1
    `;

    if (fidUser.length === 0) {
      return NextResponse.json({ success: false, error: "FID not found" }, { status: 404 });
    }

    const updated = await sql`
      UPDATE "2026_users"
      SET eth_address = ${eth_address}, updated_at = now()
      WHERE fid = ${fid}
      RETURNING id, fid, username, display_name, basename, eth_address,
                created_at, updated_at, provider, og, auth_type
    `;

    return NextResponse.json({ success: true, user: toPublicUser(updated[0]) });
  } catch (error) {
    console.error("[api/user/wallet] PATCH error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}