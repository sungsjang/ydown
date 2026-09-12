-- YDown search feature. Run once after database/schema.sql. Safe to re-run.
begin;
alter table public.agents add column if not exists search_last_seen_at timestamptz;
alter table public.agents add column if not exists search_version text;
create table if not exists public.search_requests (
  id uuid primary key default gen_random_uuid(),
  request_key uuid not null unique,
  query text not null check (char_length(query) between 1 and 200),
  status text not null default 'queued' check (status in ('queued','running','completed','failed')),
  results jsonb not null default '[]'::jsonb,
  error_message text,
  agent_id text,
  created_at timestamptz not null default now(),
  deadline_at timestamptz not null default now() + interval '2 minutes',
  expires_at timestamptz not null default now() + interval '24 hours'
);
create index if not exists idx_search_queue on public.search_requests(status, created_at);
alter table public.search_requests enable row level security;
revoke all on public.search_requests from public, anon, authenticated;
grant all on public.search_requests to service_role;

create or replace function public.create_search(p_query text, p_request_key uuid)
returns setof public.search_requests language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(79204101);
  if p_query is null or p_request_key is null or char_length(trim(p_query)) not between 1 and 200 then raise exception 'Invalid search query'; end if;
  if exists(select 1 from public.search_requests where request_key=p_request_key) then
    return query select * from public.search_requests where request_key=p_request_key;
    return;
  end if;
  if not exists(select 1 from public.agents where search_last_seen_at > now()-interval '30 seconds') then
    raise exception 'SEARCH_AGENT_OFFLINE';
  end if;
  if (select count(*) from public.search_requests where created_at > now()-interval '1 minute') >= 6 then
    raise exception 'SEARCH_RATE_LIMIT';
  end if;
  if (select count(*) from public.search_requests where status in ('queued','running') and deadline_at > now()) >= 3 then
    raise exception 'SEARCH_QUEUE_FULL';
  end if;
  return query insert into public.search_requests(query,request_key) values(trim(p_query),p_request_key) returning *;
end; $$;

create or replace function public.claim_search(p_agent_id text, p_version text)
returns setof public.search_requests language plpgsql security definer set search_path = public as $$
declare selected_id uuid;
begin
  insert into public.agents(agent_id,search_last_seen_at,search_version)
  values(p_agent_id,now(),p_version)
  on conflict(agent_id) do update set search_last_seen_at=now(), search_version=excluded.search_version;
  delete from public.search_requests where expires_at < now();
  update public.search_requests set status='failed', error_message='검색 시간이 초과되었습니다. 다시 검색해 주세요.'
  where status in ('queued','running') and deadline_at < now();
  select id into selected_id from public.search_requests where status='queued'
  order by created_at for update skip locked limit 1;
  if selected_id is null then return; end if;
  return query update public.search_requests set status='running', agent_id=p_agent_id,
    deadline_at=now()+interval '150 seconds' where id=selected_id returning *;
end; $$;

create or replace function public.enqueue_search_results(p_search_id uuid, p_video_ids text[], p_outputs jsonb)
returns setof public.jobs language plpgsql security definer set search_path = public as $$
declare search_row public.search_requests; video_id text; entry jsonb; key_prefix text;
begin
  if coalesce(array_length(p_video_ids,1),0) not between 1 and 20 then raise exception 'Invalid selection'; end if;
  if p_outputs is null or p_outputs not in ('["video"]'::jsonb,'["mp3"]'::jsonb,'["mp3","video"]'::jsonb) then raise exception 'Invalid outputs'; end if;
  select * into search_row from public.search_requests where id=p_search_id and status='completed' and expires_at>now();
  if not found then raise exception 'SEARCH_EXPIRED'; end if;
  foreach video_id in array p_video_ids loop
    if video_id !~ '^[A-Za-z0-9_-]{11}$' then raise exception 'Invalid video ID'; end if;
    select value into entry from jsonb_array_elements(search_row.results) where value->>'id'=video_id;
    if entry is null then raise exception 'Video not in search results'; end if;
    key_prefix := 'search:' || p_search_id::text || ':' || video_id || ':' || p_outputs::text;
    insert into public.jobs(request_key,url,outputs,playlist_mode,title)
      values(key_prefix,'https://www.youtube.com/watch?v='||video_id,p_outputs,'single',entry->>'title')
      on conflict(request_key) do nothing;
    return query select * from public.jobs where request_key=key_prefix;
  end loop;
end; $$;
revoke all on function public.create_search(text,uuid) from public, anon, authenticated;
revoke all on function public.claim_search(text,text) from public, anon, authenticated;
revoke all on function public.enqueue_search_results(uuid,text[],jsonb) from public, anon, authenticated;
grant execute on function public.create_search(text,uuid) to service_role;
grant execute on function public.claim_search(text,text) to service_role;
grant execute on function public.enqueue_search_results(uuid,text[],jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
