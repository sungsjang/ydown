import type { OutputType, PlaylistMode } from "@/lib/types";

const ALLOWED_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

export interface CreateJobInput {
  url: string;
  outputs: OutputType[];
  playlist_mode: PlaylistMode;
}

export function parseCreateJob(value: unknown): CreateJobInput {
  if (!value || typeof value !== "object") throw new Error("요청 형식이 올바르지 않습니다.");
  const body = value as Record<string, unknown>;
  if (typeof body.url !== "string" || body.url.length > 2048) throw new Error("YouTube 주소를 확인해 주세요.");

  let parsed: URL;
  try {
    parsed = new URL(body.url.trim());
  } catch {
    throw new Error("올바른 URL이 아닙니다.");
  }
  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error("지원되는 YouTube HTTPS 주소만 입력할 수 있습니다.");
  }

  if (!Array.isArray(body.outputs)) throw new Error("다운로드 형식을 선택해 주세요.");
  const outputs = [...new Set(body.outputs)].filter((item): item is OutputType => item === "video" || item === "mp3");
  if (outputs.length === 0 || outputs.length !== body.outputs.length) throw new Error("다운로드 형식이 올바르지 않습니다.");

  const playlistMode = body.playlist_mode;
  if (playlistMode !== "single" && playlistMode !== "full") throw new Error("플레이리스트 처리 방식을 선택해 주세요.");

  return { url: parsed.toString(), outputs, playlist_mode: playlistMode };
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new Error("허용되지 않은 요청 출처입니다.");
}
