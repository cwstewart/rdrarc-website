begin;

create table public.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  approved boolean not null default false,
  role text not null default 'member' check (role in ('member', 'admin')),
  created_at timestamptz not null default now()
);
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 160),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  location text not null default '' check (length(location) <= 300),
  description text not null default '' check (length(description) <= 5000),
  created_at timestamptz not null default now()
);
create index events_starts_at_idx on public.events(starts_at);
create index events_ends_at_idx on public.events(ends_at);

alter table public.members enable row level security;
alter table public.events enable row level security;
revoke all on public.members, public.events from anon, authenticated;
grant select on public.members to authenticated;
grant update (approved) on public.members to authenticated;
grant select, insert, update, delete on public.events to authenticated;

-- Definer helpers avoid recursive member policies. Never trust user-editable metadata.
create function public.is_club_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.members where user_id = (select auth.uid()) and approved and role = 'admin'); $$;
create function public.is_club_member() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.members where user_id = (select auth.uid()) and approved); $$;
revoke all on function public.is_club_admin(), public.is_club_member() from public, anon;
grant execute on function public.is_club_admin(), public.is_club_member() to authenticated;

create policy members_read on public.members for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_club_admin()));
create policy members_approve on public.members for update to authenticated
  using ((select public.is_club_admin()) and role = 'member')
  with check ((select public.is_club_admin()) and role = 'member');
create policy events_read on public.events for select to authenticated
  using ((select public.is_club_member()));
create policy events_insert on public.events for insert to authenticated
  with check ((select public.is_club_admin()));
create policy events_update on public.events for update to authenticated
  using ((select public.is_club_admin())) with check ((select public.is_club_admin()));
create policy events_delete on public.events for delete to authenticated
  using ((select public.is_club_admin()));

create function public.handle_club_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.members (user_id, email) values (new.id, coalesce(new.email, ''))
  on conflict (user_id) do update set email = excluded.email;
  return new;
end;
$$;
revoke all on function public.handle_club_user() from public, anon, authenticated;
create trigger on_club_user_created after insert on auth.users
  for each row execute function public.handle_club_user();
create trigger on_club_email_updated after update of email on auth.users
  for each row execute function public.handle_club_user();

-- Existing accounts also start unapproved; the owner explicitly bootstraps an administrator.
insert into public.members (user_id, email) select id, coalesce(email, '') from auth.users;
commit;
