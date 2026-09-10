import { isAgentAuthorized } from "@/lib/auth";
import { apiError, noStoreJson } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  if (!isAgentAuthorized(request)) return apiError("에이전트 인증에 실패했습니다.", 401);
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const agentId = typeof body.agent_id === "string" ? body.agent_id.trim().slice(0, 80) : "";
    const hostname = typeof body.hostname === "string" ? body.hostname.trim().slice(0, 120) : "unknown";
    const version = typeof body.version === "string" ? body.version.trim().slice(0, 40) : "unknown";
    if (!agentId) return apiError("agent_id가 필요합니다.");
    const { data, error } = await supabaseAdmin().rpc("claim_next_job", {
      p_agent_id: agentId, p_hostname: hostname, p_version: version, p_lease_seconds: 120,
    });
    if (error) return apiError("작업 큐에 연결하지 못했습니다.", 503);
    return noStoreJson({ job: data?.[0] ?? null });
  } catch {
    return apiError("작업 요청을 읽지 못했습니다.");
  }
}
