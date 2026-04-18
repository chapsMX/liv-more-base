import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fidParam    = searchParams.get("fid");
    const userIdParam = searchParams.get("userId");
    const dateParam   = searchParams.get("date");
    const fromParam   = searchParams.get("from");
    const toParam     = searchParams.get("to");

    const fid    = fidParam    ? parseInt(fidParam, 10)    : NaN;
    const userId = userIdParam ? parseInt(userIdParam, 10) : NaN;

    const hasFid    = Number.isInteger(fid)    && fid    > 0;
    const hasUserId = Number.isInteger(userId) && userId > 0;

    if (!hasFid && !hasUserId) {
      return NextResponse.json(
        { success: false, error: "fid or userId is required and must be a positive integer" },
        { status: 400 }
      );
    }

    const hasSingleDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam);
    const hasRange =
      fromParam && toParam &&
      /^\d{4}-\d{2}-\d{2}$/.test(fromParam) &&
      /^\d{4}-\d{2}-\d{2}$/.test(toParam);

    if (!hasSingleDate && !hasRange) {
      return NextResponse.json(
        { success: false, error: "Provide date=YYYY-MM-DD or from=YYYY-MM-DD&to=YYYY-MM-DD" },
        { status: 400 }
      );
    }

    // Resolver userId interno
    let resolvedUserId: number;

    if (hasFid) {
      const userRows = await sql`
        SELECT id FROM "2026_users" WHERE fid = ${fid} LIMIT 1
      `;
      if (userRows.length === 0) {
        return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
      }
      resolvedUserId = userRows[0].id as number;
    } else {
      const userRows = await sql`
        SELECT id FROM "2026_users" WHERE id = ${userId} LIMIT 1
      `;
      if (userRows.length === 0) {
        return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
      }
      resolvedUserId = userRows[0].id as number;
    }

    type StepRow = { date: string; steps: number; attestation_hash: string | null };
    let rows: StepRow[];

    if (hasSingleDate) {
      rows = (await sql`
        SELECT date::text, steps, attestation_hash
        FROM "2026_daily_steps"
        WHERE user_id = ${resolvedUserId} AND date = ${dateParam}
        LIMIT 1
      `) as StepRow[];
    } else {
      if (fromParam! > toParam!) {
        return NextResponse.json(
          { success: false, error: "from must be <= to" },
          { status: 400 }
        );
      }
      rows = (await sql`
        SELECT date::text, steps, attestation_hash
        FROM "2026_daily_steps"
        WHERE user_id = ${resolvedUserId}
          AND date >= ${fromParam}
          AND date <= ${toParam}
        ORDER BY date ASC
      `) as StepRow[];
    }

    const steps = rows.map((r) => ({
      date: r.date,
      steps: Number(r.steps),
      attestation_hash: r.attestation_hash ?? null,
    }));

    return NextResponse.json({
      success: true,
      steps: hasSingleDate ? (steps[0] ?? null) : steps,
    });
  } catch (err) {
    console.error("[api/steps/daily] Error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}