-- ============================================================
-- Lineup feature: teams, game_lineups
-- ============================================================

-- teams: reusable rosters that persist across games
create table if not exists teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  -- players is an ordered array. Each element:
  -- { batting_order: 1-9, name: "First Last", position: "SS", number: "12" }
  -- number is optional.
  players     jsonb not null default '[]',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists teams_name_idx on teams(name);

-- game_lineups: the actual lineup submitted for a specific game.
-- Separate from teams so editing a game lineup doesn't mutate the team roster.
create table if not exists game_lineups (
  id              uuid primary key default gen_random_uuid(),
  game_id         text not null references games(id) on delete cascade,
  side            text not null check (side in ('home', 'away')),
  team_id         uuid references teams(id) on delete set null,
  -- Snapshot of players at game time (decoupled from teams.players after save)
  players         jsonb not null default '[]',
  -- Tracks which batting order slot is currently up (0-indexed into players array)
  current_batter_index  int not null default 0,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (game_id, side)
);

create index if not exists game_lineups_game_id_idx on game_lineups(game_id);

-- RLS: same open policy as existing tables
alter table teams enable row level security;
alter table game_lineups enable row level security;

create policy "Public read teams"         on teams for select using (true);
create policy "Public insert teams"       on teams for insert with check (true);
create policy "Public update teams"       on teams for update using (true);

create policy "Public read game_lineups"  on game_lineups for select using (true);
create policy "Public insert game_lineups" on game_lineups for insert with check (true);
create policy "Public update game_lineups" on game_lineups for update using (true);

-- updated_at triggers
create trigger teams_updated_at
  before update on teams
  for each row execute function update_updated_at();

create trigger game_lineups_updated_at
  before update on game_lineups
  for each row execute function update_updated_at();
