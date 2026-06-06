-- Vitalis initial schema — implements PLAN.md §3.3 data model.
-- Job-queue pipeline + the claims ledger (the compliance backbone, §6).
-- RLS: the worker uses the service role (bypasses RLS); the dashboard uses
-- the anon/authed key and only reads. No anon writes anywhere.

create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- ── enums ──────────────────────────────────────────────────────────────
create type pipeline_stage as enum (
  'topic_scout','script','fact_check','storyboard',
  'asset_gen','render','metadata','review','publish','analytics'
);
create type job_status     as enum ('queued','running','done','failed','blocked');
create type video_status   as enum (
  'idea','scripting','fact_check','needs_revision','storyboard',
  'asset_gen','rendering','pending_review','approved','rejected',
  'scheduled','published','failed'
);
create type content_pillar as enum (
  'drug_journey','disease_siege','inside_the_cell','patient_story','myth_vs_mechanism'
);
create type claim_risk     as enum ('general','clinical','high_risk');
create type claim_status   as enum ('unverified','supported','refuted','needs_review');
create type asset_kind     as enum ('voiceover','library_scene','background','caption','thumbnail','music','broll');

-- ── topics: the curated taxonomy + demand-scored backlog (§2.4) ────────
create table topics (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  pillar          content_pillar not null,
  -- launch is scoped to the T2D wedge (§5.3); broaden as the library grows.
  domain          text not null default 'metabolic_t2d',
  demand_score    numeric not null default 0,        -- search demand
  competition_gap numeric not null default 0,        -- inverse of crowding
  evergreen_score numeric not null default 0,
  rank            numeric generated always as
                    (demand_score * 0.5 + competition_gap * 0.3 + evergreen_score * 0.2) stored,
  -- coverage rule (§5.3): a topic is only eligible once the library can render it.
  library_covered boolean not null default false,
  status          text not null default 'backlog',   -- backlog | queued | produced | retired
  embedding       vector(3072),                       -- text-embedding-3-large, for dedupe
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── videos: one row per video, the pipeline subject ────────────────────
create table videos (
  id            uuid primary key default gen_random_uuid(),
  topic_id      uuid references topics(id) on delete set null,
  pillar        content_pillar not null,
  title         text,
  status        video_status not null default 'idea',
  duration_sec  int,
  format        text not null default 'long_form',     -- long_form | short
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── scripts: narrative beats + SSML (§3.1 ②) ───────────────────────────
create table scripts (
  id              uuid primary key default gen_random_uuid(),
  video_id        uuid not null references videos(id) on delete cascade,
  beats           jsonb not null default '[]',          -- [{beat, vo_text, ssml, motion_spec_ref}]
  ssml            text,
  word_count      int,
  reading_level   numeric,
  -- §0.5 #1: the unfakeable authorship signal. A video cannot pass review
  -- without the founder's original RN perspective recorded here.
  rn_commentary       text,
  rn_commentary_source text default 'voice_memo',       -- how it was captured (§2.3)
  created_at      timestamptz not null default now()
);

-- ── claims: THE COMPLIANCE LEDGER (§6). Every medical assertion + sources ──
create table claims (
  id           uuid primary key default gen_random_uuid(),
  video_id     uuid not null references videos(id) on delete cascade,
  assertion    text not null,
  risk         claim_risk not null default 'general',
  status       claim_status not null default 'unverified',
  -- citations: [{source, title, url, license, quote}] — corpus is license-clean (§6).
  citations    jsonb not null default '[]',
  refutation   text,                                    -- adversarial second-pass result
  reviewed_by  text,                                    -- founder (RN) on high_risk
  created_at   timestamptz not null default now()
);

-- ── assets: per-beat media in Supabase Storage (§3.1 ⑤) ────────────────
create table assets (
  id          uuid primary key default gen_random_uuid(),
  video_id    uuid not null references videos(id) on delete cascade,
  beat_index  int,
  kind        asset_kind not null,
  storage_path text,                                    -- supabase storage object path
  -- for library_scene: which validated module + the motion_spec that drove it (§5).
  module_key  text,
  motion_spec jsonb,
  meta        jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

-- ── jobs: the resumable queue (§3.2) ───────────────────────────────────
create table jobs (
  id          uuid primary key default gen_random_uuid(),
  video_id    uuid references videos(id) on delete cascade,
  stage       pipeline_stage not null,
  status      job_status not null default 'queued',
  attempts    int not null default 0,
  max_attempts int not null default 3,
  payload     jsonb not null default '{}',
  error       text,
  run_after   timestamptz not null default now(),       -- backoff scheduling
  locked_at   timestamptz,                              -- worker lease
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index jobs_pickup_idx on jobs (status, run_after) where status = 'queued';

-- ── review_queue: the human gate (§7), with automated checklist results ──
create table review_queue (
  id              uuid primary key default gen_random_uuid(),
  video_id        uuid not null references videos(id) on delete cascade,
  checklist       jsonb not null default '{}',          -- fact-check flags, ad-suitability, policy
  flagged_claims  int not null default 0,
  draft_url       text,
  thumbnail_path  text,
  decision        text,                                 -- approve | revise | reject
  decided_by      text,
  decided_at      timestamptz,
  created_at      timestamptz not null default now()
);

-- ── publish_log: what shipped, with disclaimer audit (§3.3) ────────────
create table publish_log (
  id             uuid primary key default gen_random_uuid(),
  video_id       uuid not null references videos(id) on delete cascade,
  youtube_id     text,
  published_at   timestamptz,
  disclaimer_hash text not null,                        -- proves a disclaimer shipped
  visibility     text not null default 'public',
  created_at     timestamptz not null default now()
);

-- ── metrics: analytics feedback loop -> topic re-ranking (§3.1 ⑩) ───────
create table metrics (
  id          uuid primary key default gen_random_uuid(),
  video_id    uuid not null references videos(id) on delete cascade,
  as_of       date not null,
  views       bigint default 0,
  watch_time_min bigint default 0,
  avg_view_pct numeric,
  ctr         numeric,
  subs_gained int default 0,
  created_at  timestamptz not null default now(),
  unique (video_id, as_of)
);

-- ── updated_at trigger ─────────────────────────────────────────────────
create or replace function set_updated_at() returns trigger
  language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger trg_topics_updated before update on topics
  for each row execute function set_updated_at();
create trigger trg_videos_updated before update on videos
  for each row execute function set_updated_at();
create trigger trg_jobs_updated before update on jobs
  for each row execute function set_updated_at();

-- ── RLS: lock everything; worker = service role (bypass), dashboard = read ──
alter table topics       enable row level security;
alter table videos       enable row level security;
alter table scripts      enable row level security;
alter table claims       enable row level security;
alter table assets       enable row level security;
alter table jobs         enable row level security;
alter table review_queue enable row level security;
alter table publish_log  enable row level security;
alter table metrics      enable row level security;

-- Authenticated dashboard users may READ (review UI). No anon access, no writes.
-- The worker bypasses RLS via the service-role key.
do $$
declare t text;
begin
  foreach t in array array[
    'topics','videos','scripts','claims','assets',
    'jobs','review_queue','publish_log','metrics'
  ] loop
    execute format(
      'create policy %I on %I for select to authenticated using (true);',
      t || '_read', t);
  end loop;
end $$;
