-- Commonplace schema. Run this in the Supabase SQL editor.

create table public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  author text default '',
  status text not null default 'reading' check (status in ('reading','finished','wishlist')),
  tags text[] not null default '{}',
  bookmark text default '',
  created_at timestamptz not null default now()
);

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  type text not null check (type in ('note','quote')),
  text text not null,
  commentary text default '',
  chapter text default '',
  page text default '',
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create table public.reading_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  mark text not null,
  at timestamptz not null default now()
);

create table public.syntheses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

-- Row Level Security: each user sees only their own rows.
alter table public.books enable row level security;
alter table public.entries enable row level security;
alter table public.reading_log enable row level security;
alter table public.syntheses enable row level security;

create policy "own books" on public.books
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own entries" on public.entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own reading_log" on public.reading_log
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own syntheses" on public.syntheses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index entries_book_idx on public.entries (book_id, created_at desc);
create index reading_log_book_idx on public.reading_log (book_id, at desc);
create index books_user_idx on public.books (user_id, created_at desc);
