import { isSignedIn } from "@/lib/auth";
import { apiError, noStoreJson } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { searchError, UUID, VIDEO_ID } from "@/lib/search";
import { assertSameOrigin } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  if (!(await isSignedIn())) return apiError("로그인이 필요합니다.", 401);
  const { id } = await context.params;
  if (!UUID.test(id)) return apiError("검색 ID가 올바르지 않습니다.");
  const { data, error } = await supabaseAdmin().from("search_requests").select("*").eq("id", id).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error) return searchError(error);
  if (!data) return apiError("검색 결과가 만료되었습니다. 다시 검색해 주세요.", 410);
  if (["queued", "running"].includes(data.status) && Date.parse(data.deadline_at) < Date.now()) {
    data.status = "failed";
    data.error_message = "검색 시간이 초과되었습니다. PC 연결을 확인하고 다시 검색해 주세요.";
  }
  return noStoreJson({ search: data });
}

export async function POST(request: Request, context: Context) {
  if (!(await isSignedIn())) return apiError("로그인이 필요합니다.", 401);
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    if (!UUID.test(id)) return apiError("검색 ID가 올바르지 않습니다.");
    const body = await request.json();
    if (!Array.isArray(body?.ids) || body.ids.length < 1 || body.ids.length > 20 || body.ids.some((v: unknown) => typeof v !== "string" || !VIDEO_ID.test(v))) return apiError("다운로드할 영상을 선택해 주세요.");
    if (!Array.isArray(body.outputs) || body.outputs.length < 1 || body.outputs.length > 2 || body.outputs.some((v: unknown) => v !== "video" && v !== "mp3")) return apiError("저장 형식을 선택해 주세요.");
    const { data, error } = await supabaseAdmin().rpc("enqueue_search_results", {
      p_search_id: id, p_video_ids: [...new Set(body.ids)],
      p_outputs: [...new Set(body.outputs)].sort(),
    });
    if (error) return searchError(error);
    return noStoreJson({ jobs: data });
  } catch {
    return apiError("다운로드 요청을 처리하지 못했습니다.");
  }
}
