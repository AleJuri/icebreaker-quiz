-- =============================================
-- EJECUTAR ESTO EN SUPABASE SQL EDITOR
-- =============================================

-- tabla de jugadores
create table if not exists players (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  is_admin boolean default false,
  score integer default 0,
  joined_at timestamp with time zone default now()
);

-- tabla de estado del juego (solo hay 1 fila siempre)
create table if not exists game_state (
  id text primary key default 'game',
  status text default 'lobby', -- lobby | playing | block_break | finished
  current_question integer default 0,
  question_started_at timestamp with time zone,
  answers_count integer default 0
);

-- tabla de respuestas
create table if not exists answers (
  id uuid default gen_random_uuid() primary key,
  player_id uuid references players(id),
  question_id integer not null,
  answer_index integer not null,
  is_correct boolean not null,
  points integer default 0,
  answered_at timestamp with time zone default now()
);

-- insertar estado inicial del juego
insert into game_state (id, status, current_question, answers_count)
values ('game', 'lobby', 0, 0)
on conflict (id) do nothing;

-- habilitar realtime en todas las tablas
alter publication supabase_realtime add table players;
alter publication supabase_realtime add table game_state;
alter publication supabase_realtime add table answers;

-- policies para acceso público (icebreaker no necesita auth)
alter table players enable row level security;
alter table game_state enable row level security;
alter table answers enable row level security;

create policy "public read players" on players for select using (true);
create policy "public insert players" on players for insert with check (true);
create policy "public update players" on players for update using (true);
create policy "public delete players" on players for delete using (true);

create policy "public read game_state" on game_state for select using (true);
create policy "public update game_state" on game_state for update using (true);

create policy "public read answers" on answers for select using (true);
create policy "public insert answers" on answers for insert with check (true);

-- función para resetear el juego completo
create or replace function reset_game()
returns void as $$
begin
  delete from answers;
  delete from players;
  update game_state set
    status = 'lobby',
    current_question = 0,
    question_started_at = null,
    answers_count = 0
  where id = 'game';
end;
$$ language plpgsql;
