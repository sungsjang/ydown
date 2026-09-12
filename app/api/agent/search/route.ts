import { isAgentAuthorized } from "@/lib/auth";
import { apiError, noStoreJson } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { parseSearchResults, searchError, UUID } from "@/lib/search";

export async function POST(request: Request) {
  if (!isAgentAuthorized(request)) return apiError("에이전트 인증에 실패했습니다.", 401);
  try {
    const body = await request.json();
    if (typeof body?.agent_id !== "string" || !body.agent_id.trim() || body.agent_id.length > 80) return apiError("agent_id를 확인해 주세요.");
    const { data, error } = await supabaseAdmin().rpc("claim_search", {
      p_agent_id: body.agent_id, p_version: typeof body.version === "string" ? body.version.slice(0, 40) : "unknown",
    });
    if (error) return searchError(error);
    return noStoreJson({ search: data?.[0] ?? null });
  } catch {
    return apiError("검색 요청을 읽지 못했습니다.");
  }
}

export async function PATCH(request: Request) {
  if (!isAgentAuthorized(request)) return apiError("에이전트 인증에 실패했습니다.", 401);
  try {
    const body = await request.json();
    if (!body || typeof body.id !== "string" || !UUID.test(body.id) || typeof body.agent_id !== "string") return apiError("검색 요청 ID를 확인해 주세요.");
    const updates = body.status === "completed"
      ? { status: "completed", results: parseSearchResults(body.results), error_message: null }
      : body.status === "failed" ? { status: "failed", error_message: "YouTube 검색에 실패했습니다. 잠시 후 다시 시도해 주세요." } : null;
    if (!updates) return apiError("검색 상태를 확인해 주세요.");
    const { data, error } = await supabaseAdmin().from("search_requests").update(updates)
      .eq("id", body.id).eq("agent_id", body.agent_id).eq("status", "running")
      .gt("deadline_at", new Date().toISOString()).select("id");
    if (error) return searchError(error);
    if (!data?.length) return apiError("만료되었거나 이미 처리된 검색입니다.", 409);
    return noStoreJson({ ok: true });
  } catch {
    return apiError("검색 결과를 저장하지 못했습니다.");
  }
}

export async function PUT(request: Request) {
  if (!isAgentAuthorized(request)) return apiError("에이전트 인증에 실패했습니다.", 401);
  try {
    const body = await request.json();
    if (typeof body?.agent_id !== "string" || !body.agent_id || body.agent_id.length > 80) return apiError("agent_id를 확인해 주세요.");
    const { error } = await supabaseAdmin().from("agents").update({ search_last_seen_at: new Date().toISOString() }).eq("agent_id", body.agent_id);
    if (error) return searchError(error);
    return noStoreJson({ ok: true });
  } catch {
    return apiError("검색 연결 상태를 갱신하지 못했습니다.");
  }
}
