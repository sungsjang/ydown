import { randomUUID } from "node:crypto";
import { isSignedIn } from "@/lib/auth";
import { apiError, noStoreJson } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { assertSameOrigin, parseCreateJob } from "@/lib/validation";

export async function GET() {
  if (!(await isSignedIn())) return apiError("로그인이 필요합니다.", 401);
  const db = supabaseAdmin();
  const [{ data: jobs, error }, { data: agents }] = await Promise.all([
    db.from("jobs").select("*").order("created_at", { ascending: false }).limit(100),
    db.from("agents").select("*").order("last_seen_at", { ascending: false }).limit(10),
  ]);
  if (error) return apiError("작업 목록을 불러오지 못했습니다.", 503);
  return noStoreJson({ jobs: jobs ?? [], agents: agents ?? [], server_time: new Date().toISOString() });
}

export async function POST(request: Request) {
  if (!(await isSignedIn())) return apiError("로그인이 필요합니다.", 401);
  try {
    assertSameOrigin(request);
    const input = parseCreateJob(await request.json());
    const suppliedKey = request.headers.get("idempotency-key")?.trim();
    const requestKey = suppliedKey && /^[A-Za-z0-9_-]{8,128}$/.test(suppliedKey) ? suppliedKey : randomUUID();
    const db = supabaseAdmin();
    const { data, error } = await db.from("jobs").insert({ ...input, request_key: requestKey }).select("*").single();
    if (error?.code === "23505") {
      const existing = await db.from("jobs").select("*").eq("request_key", requestKey).single();
      if (!existing.error) return noStoreJson({ job: existing.data }, { status: 200 });
    }
    if (error) return apiError("작업을 등록하지 못했습니다.", 503);
    await db.from("job_events").insert({ job_id: data.id, event_type: "created", message: "웹에서 다운로드 요청" });
    return noStoreJson({ job: data }, { status: 201 });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "요청을 처리하지 못했습니다.");
  }
}
