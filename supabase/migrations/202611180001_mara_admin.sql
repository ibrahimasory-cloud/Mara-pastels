begin;

create table public.mara_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.mara_admins enable row level security;
revoke all on public.mara_admins from public, anon, authenticated;

create function public.is_mara_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.mara_admins as admin
    where admin.user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_mara_admin() from public, anon, authenticated;
grant execute on function public.is_mara_admin() to authenticated;

create table public.mara_site (
  id integer primary key default 1 check (id = 1),
  revision integer not null default 1 check (revision > 0),
  content jsonb not null default '{"texts":{},"images":{},"events":[]}'::jsonb
    check (jsonb_typeof(content) = 'object')
);
insert into public.mara_site (id) values (1);
alter table public.mara_site enable row level security;
revoke all on public.mara_site from public, anon, authenticated;
grant select on public.mara_site to anon, authenticated;
grant update (revision, content) on public.mara_site to authenticated;

create policy "Public reads published content"
on public.mara_site for select to anon, authenticated using (true);

create policy "Mara admins publish content"
on public.mara_site for update to authenticated
using ((select public.is_mara_admin()))
with check ((select public.is_mara_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mara-media', 'mara-media', true, 6291456, array['image/jpeg', 'image/png', 'image/webp']);

create policy "Mara admins upload public site photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'mara-media'
  and (select public.is_mara_admin())
  and name ~ '^[a-f0-9-]{36}\.(jpeg|png|webp)$'
);

create table public.mara_inbox (
  id bigint generated always as identity primary key,
  message_id text not null unique,
  sender text not null check (sender ~ '^[0-9]{5,20}$'),
  received_at timestamptz not null,
  body text not null
);
alter table public.mara_inbox enable row level security;
revoke all on public.mara_inbox from public, anon, authenticated;
grant select on public.mara_inbox to authenticated;
grant select, insert on public.mara_inbox to service_role;
grant usage on sequence public.mara_inbox_id_seq to service_role;

create policy "Mara admins read the inbox"
on public.mara_inbox for select to authenticated using ((select public.is_mara_admin()));

commit;
