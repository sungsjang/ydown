"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { SearchRequest } from "@/lib/search";
import type { OutputType } from "@/lib/types";

function durationLabel(seconds: number | null) {
  if (seconds === null) return "";
  const minutes = Math.floor(seconds / 60);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`
    : `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function YoutubeSearch({ onQueued }: { onQueued: () => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<SearchRequest | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [outputs, setOutputs] = useState<OutputType[]>(["video", "mp3"]);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState("");
  const [queued, setQueued] = useState<Set<string>>(new Set());
  const submitting = useRef(false);
  const creating = useRef(false);
  const requestKey = useRef({ query: "", key: "" });
  const format = [...outputs].sort().join(",");
  const waiting = search?.status === "queued" || search?.status === "running";
  const searchId = search?.id;

  useEffect(() => {
    if (!searchId || !waiting) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const id = searchId;
    async function poll() {
      try {
        const response = await fetch(`/api/search/${id}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "검색 상태를 확인하지 못했습니다.");
        if (controller.signal.aborted) return;
        setSearch((current) => current?.id === id ? body.search : current);
        if (["queued", "running"].includes(body.search.status)) timer = setTimeout(poll, 2000);
      } catch (error) {
        if (controller.signal.aborted) return;
        setMessage(error instanceof Error ? error.message : "연결 상태를 확인해 주세요.");
        setSearch((current) => current?.id === id ? { ...current, status: "failed", error_message: "연결을 확인한 뒤 다시 검색해 주세요." } : current);
      }
    }
    timer = setTimeout(poll, 1000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [searchId, waiting]); // Each search owns its polling lifecycle.

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (creating.current || !query.trim()) return;
    creating.current = true;
    setBusy(true); setMessage(""); setSearch(null); setSelected(new Set()); setQueued(new Set());
    if (requestKey.current.query !== query.trim() || !requestKey.current.key) {
      requestKey.current = { query: query.trim(), key: crypto.randomUUID() };
    }
    try {
      const response = await fetch("/api/search", {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": requestKey.current.key },
        body: JSON.stringify({ query: query.trim() }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "검색을 시작하지 못했습니다.");
      setSearch(body.search);
      requestKey.current.key = "";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "검색을 시작하지 못했습니다.");
    } finally { setBusy(false); creating.current = false; }
  }

  async function download(ids: string[]) {
    if (!search || !ids.length || !outputs.length || submitting.current) return;
    submitting.current = true; setAdding(true); setMessage("");
    try {
      const response = await fetch(`/api/search/${search.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, outputs }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "다운로드 요청을 등록하지 못했습니다.");
      setQueued((current) => new Set([...current, ...ids.map((id) => `${id}:${format}`)]));
      setSelected(new Set());
      setMessage(`${body.jobs.length}개 영상의 다운로드 요청을 등록했습니다. 아래 작업 목록에서 확인하세요.`);
      await onQueued();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "다운로드 요청을 등록하지 못했습니다.");
    } finally { setAdding(false); submitting.current = false; }
  }

  const videos = search?.status === "completed" ? search.results : [];
  const eligible = videos.filter((video) => !queued.has(`${video.id}:${format}`));
  const chosen = eligible.filter((video) => selected.has(video.id)).map((video) => video.id);

  return <section className="search-panel" aria-label="YouTube 검색">
    <form className="request-card" onSubmit={submit}>
      <label htmlFor="youtube-query">검색어</label>
      <div className="url-row">
        <input id="youtube-query" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={200} placeholder="영상 제목, 가수, 관심 있는 주제" required />
        <button className="primary-button" disabled={busy || waiting || adding || !query.trim()}>{busy || waiting ? "검색 중…" : "검색"}</button>
      </div>
      <p className="search-help">PC에서 ydown.exe가 실행 중이어야 검색할 수 있습니다. 검색 결과는 최대 20개입니다.</p>
    </form>
    {message && <p className="notice" role="status">{message}</p>}
    {waiting && <p className="empty-state" role="status">{search.status === "queued" ? "PC가 검색 요청을 확인하고 있습니다…" : "YouTube에서 영상을 검색하고 있습니다…"}</p>}
    {search?.status === "failed" && <p className="error-line" role="alert">{search.error_message}</p>}
    {search?.status === "completed" && <>
      <div className="search-toolbar">
        <fieldset><legend>저장 형식</legend><div className="segmented">
          {(["video", "mp3"] as OutputType[]).map((output) => <button key={output} type="button" disabled={adding} className={outputs.includes(output) ? "selected" : ""} aria-pressed={outputs.includes(output)} onClick={() => setOutputs((current) => current.includes(output) ? current.filter((item) => item !== output) : [...current, output])}>{output === "video" ? "영상" : "MP3"}</button>)}
        </div></fieldset>
        <div className="search-bulk">
          <label className="job-select"><input type="checkbox" disabled={adding || !eligible.length} checked={eligible.length > 0 && chosen.length === eligible.length} onChange={() => setSelected(chosen.length === eligible.length ? new Set() : new Set(eligible.map((video) => video.id)))} />전체 선택</label>
          <button className="primary-button" disabled={adding || !chosen.length || !outputs.length} onClick={() => void download(chosen)}>{adding ? "등록 중…" : `선택 영상 다운로드 (${chosen.length})`}</button>
        </div>
      </div>
      <p className="search-help">“{search.query}” 검색 결과 {videos.length}개 · 선택한 형식으로 PC에 저장합니다.</p>
      {!videos.length && <div className="empty-state">검색 결과가 없습니다. 다른 검색어로 시도해 주세요.</div>}
      <div className="search-results">{videos.map((video) => {
        const registered = queued.has(`${video.id}:${format}`);
        return <article className="search-result" key={video.id}>
          <label className="search-check"><input type="checkbox" aria-label={`${video.title} 선택`} checked={selected.has(video.id) && !registered} disabled={adding || registered} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(video.id)) next.delete(video.id); else next.add(video.id); return next; })} /></label>
          <a className="search-thumbnail" href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noreferrer" aria-label={`${video.title} YouTube에서 열기`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`} alt="" loading="lazy" width={320} height={180} />
            {video.duration !== null && <span>{durationLabel(video.duration)}</span>}
          </a>
          <div className="search-description"><h3>{video.title}</h3><p>{video.channel || "채널 정보 없음"}</p></div>
          <button className="search-download" disabled={adding || registered || !outputs.length} onClick={() => void download([video.id])}>{registered ? "등록 완료" : "다운로드"}</button>
        </article>;
      })}</div>
    </>}
  </section>;
}
