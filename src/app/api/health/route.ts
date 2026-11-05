import { NextResponse } from "next/server";
import { hasSupabase, isDemo } from "@/lib/config";
export function GET() { return NextResponse.json({ status: hasSupabase() || isDemo() ? "ok" : "unconfigured", mode: isDemo() ? "sample" : "private" }, { status: hasSupabase() || isDemo() ? 200 : 503, headers: { "Cache-Control": "no-store" } }); }
