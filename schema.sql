-- GameStreamer — Supabase Schema
-- Run this in the Supabase SQL Editor:
-- Dashboard → SQL Editor → New query → paste → Run

-- Games table
create table if not exists games (
  id            text primary key default lower(substring(gen_random_uuid()::text, 1, 8)),
  home_team     text not null,
  away_team     text not null,
  game_date     date not null default current_date,
  stream_url    text,
  inning        int  not null default 1,
  half          text not null default 'top' check (half in ('top', 'bottom')),
  outs          int  not null default 0 check (outs >= 0 and outs <= 2),
  home_score    int  not null default 0,
  away_score    int  not null default 0,
  runners       jsonb not null default '{"first":null,"second":null,"third":null}',
  balls         int  not null default 0 check (balls >= 0 and balls <= 3),
  strikes       int  not null default 0 check (strikes >= 0 and strikes <= 2),
  inning_scores jsonb not null default '{"top":[],"bottom":[]}',
  status        text not null default 'scheduled' check (status in ('scheduled','live','final')),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- Plays table (full audit log of every play)
create table if not exists plays (
  id              uuid primary key default gen_random_uuid(),
  game_id         text not null references games(id) on delete cascade,
  inning          int  not null,
  half            text not null,
  raw_input       text not null,
  structured_play jsonb not null,
  score_after     jsonb not null,
  created_at      timestamptz default now()
);

-- Indexes
create index if not exists plays_game_id_idx on plays(game_id);
create index if not exists games_status_idx on games(status);

-- Auto-update updated_at on games
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists games_updated_at on games;
create trigger games_updated_at
  before update on games
  for each row execute function update_updated_at();

-- Enable Row Level Security
alter table games enable row level security;
alter table plays enable row level security;

-- Public read access (anyone with the link can view)
create policy "Public read games"  on games for select using (true);
create policy "Public read plays"  on plays for select using (true);

-- Public write access (for MVP — lock this down with auth later)
create policy "Public insert games" on games for insert with check (true);
create policy "Public update games" on games for update using (true);
create policy "Public insert plays" on plays for insert with check (true);
