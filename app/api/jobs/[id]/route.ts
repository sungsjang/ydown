import { isSignedIn } from "@/lib/auth";
import { apiError, noStoreJson } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { assertSameOrigin } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  if (!(await isSignedIn())) return apiError("로그인이 필요합니다.", 401);
  const { id } = await context.params;
  const { data, error } = await supabaseAdmin().from("jobs").select("*").eq("id", id).single();
  if (error) return apiError("작업을 찾을 수 없습니다.", 404);
  return noStoreJson({ job: data });
}

export async function PATCH(request: Request, context: Context) {
  if (!(await isSignedIn())) return apiError("로그인이 필요합니다.", 401);
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    const body = (await request.json()) as { action?: unknown };
    const db = supabaseAdmin();
    const current = await db.from("jobs").select("*").eq("id", id).single();
    if (current.error) return apiError("작업을 찾을 수 없습니다.", 404);

    if (body.action === "cancel") {
      const terminal = ["completed", "failed", "cancelled"].includes(current.data.status);
      if (terminal) return apiError("이미 종료된 작업입니다.", 409);
      const updates = current.data.status === "queued"
        ? { status: "cancelled", cancel_requested: true, stage: "취소됨", completed_at: new Date().toISOString() }
        : { cancel_requested: true, stage: "취소 요청됨" };
      const result = await db.from("jobs").update(updates).eq("id", id).select("*").single();
      if (result.error) return apiError("취소 요청을 저장하지 못했습니다.", 503);
      await db.from("job_events").insert({ job_id: id, event_type: "cancel_requested", message: "웹에서 취소 요청" });
      return noStoreJson({ job: result.data });
    }

    if (body.action === "retry") {
      if (!["failed", "cancelled"].includes(current.data.status)) return apiError("실패하거나 취소된 작업만 다시 시도할 수 있습니다.", 409);
      const result = await db.from("jobs").update({
        status: "queued", progress: 0, stage: "다시 대기 중", result_files: [], error_code: null,
        error_message: null, cancel_requested: false, agent_id: null, claimed_at: null,
        heartbeat_at: null, lease_expires_at: null, completed_at: null,
      }).eq("id", id).select("*").single();
      if (result.error) return apiError("작업을 다시 등록하지 못했습니다.", 503);
      await db.from("job_events").insert({ job_id: id, event_type: "retried", message: "웹에서 재시도 요청" });
      return noStoreJson({ job: result.data });
    }

    return apiError("지원하지 않는 작업입니다.");
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "요청을 처리하지 못했습니다.");
  }
}
