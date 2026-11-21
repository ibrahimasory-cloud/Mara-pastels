begin;

create or replace function public.is_mara_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.mara_admins as admin
    join auth.sessions as session on session.user_id = admin.user_id
    where admin.user_id = (select auth.uid())
      and session.id = (select (auth.jwt() ->> 'session_id')::uuid)
      and (session.not_after is null or session.not_after > now())
      and (
        (session.aal = 'aal2' and (select auth.jwt() ->> 'aal') = 'aal2')
        or not exists (
          select 1 from auth.mfa_factors as factor
          where factor.user_id = admin.user_id
            and factor.status = 'verified'
            and factor.factor_type = 'totp'
        )
      )
  );
$$;

commit;
