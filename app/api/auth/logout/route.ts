import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await clearSessionCookie();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "로그아웃 요청을 확인해 주세요." }, { status: 400 });
  }
}
