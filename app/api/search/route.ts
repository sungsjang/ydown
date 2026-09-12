import { randomUUID } from "node:crypto";
import { isSignedIn } from "@/lib/auth";
import { apiError, noStoreJson } from "@/lib/http";
import { assertSameOrigin } from "@/lib/validation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { searchError, UUID } from "@/lib/search";

export async function POST(request: Request) {
  if (!(await isSignedIn())) return apiError("로그인이 필요합니다.", 401);
  try {
    assertSameOrigin(request);
    const body = await request.json();
    if (typeof body?.query !== "string" || !body.query.trim() || body.query.trim().length > 200) return apiError("검색어를 1~200자로 입력해 주세요.");
    const key = request.headers.get("idempotency-key") || randomUUID();
    if (!UUID.test(key)) return apiError("요청 ID가 올바르지 않습니다.");
    const { data, error } = await supabaseAdmin().rpc("create_search", { p_query: body.query.trim(), p_request_key: key });
    if (error) return searchError(error);
    return noStoreJson({ search: data[0] }, { status: 202 });
  } catch {
    return apiError("검색 요청을 처리하지 못했습니다.");
  }
}
