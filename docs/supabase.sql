-- Optional Supabase / Postgres store for agent-approval-queue.
-- Run once in the Supabase SQL editor, then set SUPABASE_URL and
-- SUPABASE_SERVICE_ROLE_KEY (server-side only) in the app's environment.

create table if not exists public.queue_items (
  id          text primary key,
  -- Unique idempotency key (explicit dedupeKey, or the normalised context URL).
  -- The database rejects a duplicate even if two agents post at the same moment.
  dedupe_key  text unique,
  item        jsonb not null,
  status      text generated always as (item->>'status') stored,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists queue_items_status_idx on public.queue_items (status);
create index if not exists queue_items_created_at_idx on public.queue_items (created_at desc);

create or replace function public.queue_items_touch()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists queue_items_touch on public.queue_items;
create trigger queue_items_touch
  before update on public.queue_items
  for each row execute function public.queue_items_touch();

-- The app talks to this table only from server code with the service-role key,
-- which bypasses RLS. Enabling RLS with no policies keeps the anon key out.
alter table public.queue_items enable row level security;
