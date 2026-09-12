"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AgentInfo, Job, OutputType, PlaylistMode } from "@/lib/types";
import { YoutubeSearch } from "@/components/youtube-search";

declare global {
  interface Document {
    modelContext?: {
      registerTool: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => void | Promise<void>;
    };
  }
}

const STATUS_LABEL: Record<Job["status"], string> = {
  queued: "대기 중",
  claimed: "준비 중",
  downloading: "다운로드 중",
  postprocessing: "변환 중",
  completed: "완료",
  failed: "실패",
  cancelled: "취소됨",
};

type JobsResponse = { jobs: Job[]; agents: AgentInfo[]; server_time: string };

function timeAgo(value: string | null, now: number): string {
  if (!value) return "연결 기록 없음";
  const seconds = Math.max(0, Math.floor((now - new Date(value).getTime()) / 1000));
  if (seconds < 10) return "방금 연결됨";
  if (seconds < 60) return `${seconds}초 전`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`;
  return `${Math.floor(seconds / 3600)}시간 전`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function Dashboard() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [inputMode, setInputMode] = useState<"url" | "search">("url");
  const [outputs, setOutputs] = useState<OutputType[]>(["video", "mp3"]);
  const [playlistMode, setPlaylistMode] = useState<PlaylistMode>("single");
  const [data, setData] = useState<JobsResponse>({ jobs: [], agents: [], server_time: new Date(0).toISOString() });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedCompleted, setSelectedCompleted] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");

  const loadJobs = useCallback(async () => {
    try {
      const response = await fetch("/api/jobs", { cache: "no-store" });
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) throw new Error("작업 목록을 불러오지 못했습니다.");
      const nextData = await response.json() as JobsResponse;
      setData(nextData);
      setSelectedCompleted((current) => new Set(
        [...current].filter((id) => nextData.jobs.some((job) => job.id === id && job.status === "completed")),
      ));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "연결 상태를 확인해 주세요.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const initial = window.setTimeout(() => void loadJobs(), 0);
    const timer = window.setInterval(() => { if (!document.hidden) void loadJobs(); }, 5000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [loadJobs]);

  const createJob = useCallback(async (input: { url: string; outputs: OutputType[]; playlist_mode: PlaylistMode }) => {
    const response = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify(input),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "작업을 등록하지 못했습니다.");
    await loadJobs();
    return body.job as Job;
  }, [loadJobs]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: "create_download_job",
      title: "다운로드 작업 등록",
      description: "YouTube URL을 내 PC의 YDown 작업 대기열에 등록합니다.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "YouTube HTTPS URL" },
          outputs: { type: "array", items: { type: "string", enum: ["video", "mp3"] }, minItems: 1, uniqueItems: true },
          playlist_mode: { type: "string", enum: ["single", "full"] },
        },
        required: ["url", "outputs", "playlist_mode"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      async execute(input: unknown) {
        const candidate = input as { url?: unknown; outputs?: unknown; playlist_mode?: unknown };
        if (typeof candidate.url !== "string" || !Array.isArray(candidate.outputs) || (candidate.playlist_mode !== "single" && candidate.playlist_mode !== "full")) {
          throw new Error("다운로드 요청 형식이 올바르지 않습니다.");
        }
        const accepted = candidate.outputs.filter((item): item is OutputType => item === "video" || item === "mp3");
        if (accepted.length === 0 || accepted.length !== candidate.outputs.length) throw new Error("다운로드 형식을 확인해 주세요.");
        const job = await createJob({ url: candidate.url, outputs: accepted, playlist_mode: candidate.playlist_mode });
        return { job_id: job.id, status: job.status };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [createJob]);

  const activeAgent = data.agents[0];
  const serverNow = new Date(data.server_time).getTime();
  const agentOnline = activeAgent ? serverNow - new Date(activeAgent.last_seen_at).getTime() < 120_000 : false;
  const counts = useMemo(() => ({
    active: data.jobs.filter((job) => ["queued", "claimed", "downloading", "postprocessing"].includes(job.status)).length,
    completed: data.jobs.filter((job) => job.status === "completed").length,
  }), [data.jobs]);
  const completedIds = useMemo(
    () => data.jobs.filter((job) => job.status === "completed").map((job) => job.id),
    [data.jobs],
  );
  const allCompletedSelected = completedIds.length > 0 && completedIds.every((id) => selectedCompleted.has(id));

  function toggleOutput(output: OutputType) {
    setOutputs((current) => current.includes(output) ? current.filter((item) => item !== output) : [...current, output]);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!outputs.length) return setMessage("영상 또는 MP3를 하나 이상 선택해 주세요.");
    setSubmitting(true);
    setMessage("");
    try {
      await createJob({ url, outputs, playlist_mode: playlistMode });
      setUrl("");
      setMessage("다운로드 작업을 등록했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "작업을 등록하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function jobAction(id: string, action: "cancel" | "retry") {
    setMessage("");
    const response = await fetch(`/api/jobs/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const body = await response.json();
    if (!response.ok) setMessage(body.error || "요청을 처리하지 못했습니다.");
    await loadJobs();
  }

  function toggleCompleted(id: string) {
    setSelectedCompleted((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllCompleted() {
    setSelectedCompleted(allCompletedSelected ? new Set() : new Set(completedIds));
  }

  async function deleteSelectedCompleted() {
    const ids = [...selectedCompleted];
    if (!ids.length || !window.confirm(`선택한 완료 기록 ${ids.length}개를 Supabase에서 삭제할까요?\nPC에 저장된 파일은 삭제되지 않습니다.`)) return;
    setDeleting(true);
    setMessage("");
    try {
      const response = await fetch("/api/jobs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "완료 기록을 삭제하지 못했습니다.");
      setSelectedCompleted(new Set());
      setMessage(`${body.deleted_ids.length}개의 완료 기록을 삭제했습니다. PC 파일은 그대로 유지됩니다.`);
      await loadJobs();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "완료 기록을 삭제하지 못했습니다.");
    } finally {
      setDeleting(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-row"><div className="brand-mark small">Y</div><div><strong>YDown</strong><span>Remote download queue</span></div></div>
        <button className="text-button" onClick={logout}>로그아웃</button>
      </header>

      <section className="workspace">
        <div className="intro-row">
          <div><p className="eyebrow">NEW DOWNLOAD</p><h1>내 PC로 보내기</h1></div>
          <div className={`agent-pill ${agentOnline ? "online" : "offline"}`}><span className="status-dot" />{agentOnline ? "PC 온라인" : "PC 오프라인"}<small>{timeAgo(activeAgent?.last_seen_at ?? null, serverNow)}</small></div>
        </div>

        <div className="segmented input-tabs" aria-label="다운로드 방법">
          <button aria-pressed={inputMode === "url"} className={inputMode === "url" ? "selected" : ""} onClick={() => setInputMode("url")}>주소로 다운로드</button>
          <button aria-pressed={inputMode === "search"} className={inputMode === "search" ? "selected" : ""} onClick={() => setInputMode("search")}>YouTube 검색</button>
        </div>
        <div hidden={inputMode !== "search"}><YoutubeSearch onQueued={loadJobs} /></div>
        <form hidden={inputMode !== "url"} className="request-card" onSubmit={submit}>
          <label htmlFor="youtube-url">YouTube 주소</label>
          <div className="url-row">
            <input id="youtube-url" type="url" inputMode="url" placeholder="https://youtu.be/…" value={url} onChange={(event) => setUrl(event.target.value)} required />
            <button className="primary-button send-button" disabled={submitting || outputs.length === 0}>{submitting ? "등록 중…" : "다운로드 요청"}</button>
          </div>
          <div className="options-row">
            <fieldset><legend>저장 형식</legend><div className="segmented">
              <button type="button" className={outputs.includes("video") ? "selected" : ""} aria-pressed={outputs.includes("video")} onClick={() => toggleOutput("video")}>영상</button>
              <button type="button" className={outputs.includes("mp3") ? "selected" : ""} aria-pressed={outputs.includes("mp3")} onClick={() => toggleOutput("mp3")}>MP3</button>
            </div></fieldset>
            <fieldset><legend>목록 처리</legend><div className="segmented">
              <button type="button" className={playlistMode === "single" ? "selected" : ""} aria-pressed={playlistMode === "single"} onClick={() => setPlaylistMode("single")}>영상 하나</button>
              <button type="button" className={playlistMode === "full" ? "selected" : ""} aria-pressed={playlistMode === "full"} onClick={() => setPlaylistMode("full")}>플레이리스트</button>
            </div></fieldset>
          </div>
        </form>

        {message && <div className="notice" role="status">{message}<button onClick={() => setMessage("")} aria-label="알림 닫기">×</button></div>}

        <section className="queue-section">
          <div className="section-heading"><div><p className="eyebrow">QUEUE</p><h2>다운로드 작업</h2></div><div className="summary"><span><b>{counts.active}</b> 진행·대기</span><span><b>{counts.completed}</b> 완료</span></div></div>
          {completedIds.length > 0 && <div className="completed-actions">
            <label><input type="checkbox" checked={allCompletedSelected} onChange={toggleAllCompleted} />완료 전체 선택</label>
            <button className="delete-selected-button" disabled={selectedCompleted.size === 0 || deleting} onClick={() => void deleteSelectedCompleted()}>{deleting ? "삭제 중…" : `선택 기록 삭제${selectedCompleted.size ? ` (${selectedCompleted.size})` : ""}`}</button>
          </div>}
          {loading ? <div className="empty-state">작업 목록을 불러오는 중…</div> : data.jobs.length === 0 ? <div className="empty-state"><strong>아직 등록된 작업이 없습니다.</strong><span>위에 YouTube 주소를 넣어 첫 작업을 보내세요.</span></div> : (
            <div className="job-list">{data.jobs.map((job) => <JobCard key={job.id} job={job} selected={selectedCompleted.has(job.id)} onSelect={toggleCompleted} onAction={jobAction} />)}</div>
          )}
        </section>
      </section>
    </main>
  );
}

function JobCard({ job, selected, onSelect, onAction }: { job: Job; selected: boolean; onSelect: (id: string) => void; onAction: (id: string, action: "cancel" | "retry") => Promise<void> }) {
  const active = ["queued", "claimed", "downloading", "postprocessing"].includes(job.status);
  const label = job.title || (() => { try { return new URL(job.url).hostname + new URL(job.url).pathname; } catch { return job.url; } })();
  return (
    <article className={`job-card status-${job.status}${selected ? " selected-for-delete" : ""}`}>
      {job.status === "completed" && <label className="job-select"><input type="checkbox" checked={selected} onChange={() => onSelect(job.id)} /><span>삭제할 기록 선택</span></label>}
      <div className="job-top"><div className="job-title"><span className="job-icon">{job.outputs.includes("video") ? "▶" : "♫"}</span><div><h3>{label}</h3><p>{job.outputs.map((item) => item === "video" ? "영상" : "MP3").join(" + ")} · {job.playlist_mode === "full" ? "플레이리스트" : "영상 하나"}</p></div></div><span className="status-badge">{STATUS_LABEL[job.status]}</span></div>
      {active && <div className="progress-wrap"><div className="progress-label"><span>{job.stage || STATUS_LABEL[job.status]}</span><b>{job.progress}%</b></div><div className="progress-track"><span style={{ width: `${job.progress}%` }} /></div></div>}
      {job.status === "completed" && job.result_files.length > 0 && <p className="result-line">{job.result_files.length}개 파일 저장 완료 · {job.result_files[0]}</p>}
      {job.status === "failed" && <p className="error-line">{job.error_message || "다운로드에 실패했습니다."}</p>}
      <div className="job-footer"><time>{formatDate(job.created_at)}</time><div>{active && <button className="danger-link" onClick={() => void onAction(job.id, "cancel")}>취소</button>}{["failed", "cancelled"].includes(job.status) && <button className="retry-link" onClick={() => void onAction(job.id, "retry")}>다시 시도</button>}</div></div>
    </article>
  );
}
