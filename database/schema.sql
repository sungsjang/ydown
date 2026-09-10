-- Run this once in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  request_key text not null unique,
  url text not null,
  outputs jsonb not null,
  playlist_mode text not null check (playlist_mode in ('single', 'full')),
  status text not null default 'queued' check (status in ('queued', 'claimed', 'downloading', 'postprocessing', 'completed', 'failed', 'cancelled')),
  progress integer not null default 0 check (progress between 0 and 100),
  stage text,
  title text,
  playlist_title text,
  result_files jsonb not null default '[]'::jsonb,
  error_code text,
  error_message text,
  cancel_requested boolean not null default false,
  attempt_count integer not null default 0,
  agent_id text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  lease_expires_at timestamptz,
  completed_at timestamptz
);

create table if not exists public.job_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.jobs(id) on delete cascade,
  event_type text not null,
  message text,
  created_at timestamptz not null default now()
);

create table if not exists public.agents (
  agent_id text primary key,
  hostname text,
  version text,
  last_seen_at timestamptz not null default now(),
  current_job_id uuid references public.jobs(id) on delete set null
);

create index if not exists idx_jobs_queue on public.jobs(status, created_at)
  where status = 'queued';
create index if not exists idx_jobs_lease on public.jobs(lease_expires_at)
  where status in ('claimed', 'downloading', 'postprocessing');
create index if not exists idx_job_events_job_created on public.job_events(job_id, created_at desc);

alter table public.jobs enable row level security;
alter table public.job_events enable row level security;
alter table public.agents enable row level security;

revoke all on public.jobs from anon, authenticated;
revoke all on public.job_events from anon, authenticated;
revoke all on public.agents from anon, authenticated;

create or replace function public.claim_next_job(
  p_agent_id text,
  p_hostname text,
  p_version text,
  p_lease_seconds integer default 120
)
returns setof public.jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_id uuid;
begin
  update public.jobs
     set status = 'queued',
         agent_id = null,
         stage = '다시 연결 대기',
         lease_expires_at = null
   where status in ('claimed', 'downloading', 'postprocessing')
     and lease_expires_at < now()
     and cancel_requested = false;

  update public.jobs
     set status = 'cancelled',
         stage = '취소됨',
         completed_at = now(),
         lease_expires_at = null
   where status in ('claimed', 'downloading', 'postprocessing')
     and lease_expires_at < now()
     and cancel_requested = true;

  select id into selected_id
    from public.jobs
   where status = 'queued'
     and cancel_requested = false
   order by created_at
   for update skip locked
   limit 1;

  insert into public.agents(agent_id, hostname, version, last_seen_at, current_job_id)
  values (p_agent_id, p_hostname, p_version, now(), selected_id)
  on conflict (agent_id) do update
    set hostname = excluded.hostname,
        version = excluded.version,
        last_seen_at = excluded.last_seen_at,
        current_job_id = excluded.current_job_id;

  if selected_id is null then
    return;
  end if;

  return query
  update public.jobs
     set status = 'claimed',
         stage = 'PC에서 준비 중',
         agent_id = p_agent_id,
         claimed_at = now(),
         heartbeat_at = now(),
         lease_expires_at = now() + make_interval(secs => greatest(30, least(p_lease_seconds, 600))),
         attempt_count = attempt_count + 1,
         error_code = null,
         error_message = null
   where id = selected_id
   returning *;
end;
$$;

revoke all on function public.claim_next_job(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.claim_next_job(text, text, text, integer) to service_role;
