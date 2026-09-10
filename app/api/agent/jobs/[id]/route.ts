import { isAgentAuthorized } from "@/lib/auth";
import { apiError, noStoreJson } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase-admin";

type Context = { params: Promise<{ id: string }> };
const ACTIVE = ["claimed", "downloading", "postprocessing"];

export async function PATCH(request: Request, context: Context) {
  if (!isAgentAuthorized(request)) return apiError("에이전트 인증에 실패했습니다.", 401);
  try {
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const agentId = typeof body.agent_id === "string" ? body.agent_id.trim().slice(0, 80) : "";
    const action = body.action;
    if (!agentId) return apiError("agent_id가 필요합니다.");

    const db = supabaseAdmin();
    const current = await db.from("jobs").select("*").eq("id", id).eq("agent_id", agentId).single();
    if (current.error) return apiError("이 에이전트에 할당된 작업이 아닙니다.", 409);

    const now = new Date();
    const lease = new Date(now.getTime() + 120_000).toISOString();
    let updates: Record<string, unknown>;

    if (action === "heartbeat" || action === "progress") {
      if (!ACTIVE.includes(current.data.status)) return apiError("활성 작업이 아닙니다.", 409);
      const rawProgress = typeof body.progress === "number" ? body.progress : current.data.progress;
      const progress = Math.max(0, Math.min(99, Math.round(rawProgress)));
      const status = body.status === "postprocessing" ? "postprocessing" : "downloading";
      updates = {
        status, progress, heartbeat_at: now.toISOString(), lease_expires_at: lease,
        stage: typeof body.stage === "string" ? body.stage.slice(0, 160) : current.data.stage,
        title: typeof body.title === "string" ? body.title.slice(0, 500) : current.data.title,
        playlist_title: typeof body.playlist_title === "string" ? body.playlist_title.slice(0, 500) : current.data.playlist_title,
      };
    } else if (action === "complete") {
      const resultFiles = Array.isArray(body.result_files)
        ? body.result_files.filter((x): x is string => typeof x === "string").slice(0, 500)
        : [];
      updates = {
        status: "completed", progress: 100, stage: "완료", result_files: resultFiles,
        heartbeat_at: now.toISOString(), lease_expires_at: null, completed_at: now.toISOString(),
      };
    } else if (action === "fail") {
      const cancelled = current.data.cancel_requested || body.error_code === "cancelled";
      updates = {
        status: cancelled ? "cancelled" : "failed", stage: cancelled ? "취소됨" : "실패",
        error_code: typeof body.error_code === "string" ? body.error_code.slice(0, 80) : "download_failed",
        error_message: typeof body.error_message === "string" ? body.error_message.slice(0, 2000) : "알 수 없는 오류",
        heartbeat_at: now.toISOString(), lease_expires_at: null, completed_at: now.toISOString(),
      };
    } else {
      return apiError("지원하지 않는 에이전트 작업입니다.");
    }

    const result = await db.from("jobs").update(updates).eq("id", id).eq("agent_id", agentId).select("*").single();
    if (result.error) return apiError("작업 상태를 저장하지 못했습니다.", 503);
    await db.from("agents").upsert({
      agent_id: agentId,
      last_seen_at: now.toISOString(),
      current_job_id: action === "complete" || action === "fail" ? null : id,
    });
    await db.from("agents").update({
      last_seen_at: now.toISOString(),
      current_job_id: action === "complete" || action === "fail" ? null : id,
    }).eq("agent_id", agentId);
    return noStoreJson({ job: result.data, cancel_requested: result.data.cancel_requested });
  } catch {
    return apiError("에이전트 상태를 처리하지 못했습니다.");
  }
}
