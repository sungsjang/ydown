import { apiError } from "@/lib/http";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
export type SearchVideo = { id: string; title: string; channel: string; duration: number | null };
export type SearchRequest = {
  id: string; query: string; status: "queued" | "running" | "completed" | "failed";
  results: SearchVideo[]; error_message: string | null; deadline_at: string;
};

export function searchError(error: { code?: string; message: string }) {
  console.error("Search database error", error.code);
  if (error.message.includes("SEARCH_AGENT_OFFLINE")) return apiError("검색용 PC 에이전트를 실행해 주세요. 실행 중이라면 새 ydown.exe로 업데이트해 주세요.", 409);
  if (error.message.includes("SEARCH_RATE_LIMIT") || error.message.includes("SEARCH_QUEUE_FULL")) return apiError("검색 요청이 많습니다. 잠시 후 다시 검색해 주세요.", 429);
  if (error.message.includes("SEARCH_EXPIRED")) return apiError("검색 결과가 만료되었습니다. 다시 검색해 주세요.", 410);
  return apiError("검색 기능을 사용할 수 없습니다. Supabase에 database/search.sql이 적용되었는지 확인해 주세요.", 503);
}

export function parseSearchResults(value: unknown): SearchVideo[] {
  if (!Array.isArray(value) || value.length > 20) throw new Error("검색 결과 형식이 올바르지 않습니다.");
  const seen = new Set<string>();
  return value.map((item) => {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !VIDEO_ID.test(item.id) || seen.has(item.id)) throw new Error("영상 ID가 올바르지 않습니다.");
    if (typeof item.title !== "string" || !item.title.trim() || item.title.length > 500) throw new Error("영상 제목을 확인해 주세요.");
    seen.add(item.id);
    return {
      id: item.id, title: item.title.trim(),
      channel: typeof item.channel === "string" ? item.channel.slice(0, 200) : "",
      duration: typeof item.duration === "number" && Number.isFinite(item.duration) && item.duration >= 0 ? item.duration : null,
    };
  });
}
