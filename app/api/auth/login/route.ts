import { NextResponse } from "next/server";
import { setSessionCookie, verifyPassword } from "@/lib/auth";
import { apiError } from "@/lib/http";
import { assertSameOrigin } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = (await request.json()) as { password?: unknown };
    if (typeof body.password !== "string" || !verifyPassword(body.password)) return apiError("비밀번호가 올바르지 않습니다.", 401);
    await setSessionCookie();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "로그인할 수 없습니다.");
  }
}
