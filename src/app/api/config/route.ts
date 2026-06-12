import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    accessCodeRequired: Boolean(process.env.APP_ACCESS_CODE)
  });
}
