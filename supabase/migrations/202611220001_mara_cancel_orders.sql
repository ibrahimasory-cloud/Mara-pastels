begin;

-- Keep only the request identifier so a retry cannot recreate a deleted order.
create table public.mara_cancelled_order_requests (
  request_id uuid primary key
);
alter table public.mara_cancelled_order_requests enable row level security;
revoke all on public.mara_cancelled_order_requests from public, anon, authenticated;

alter policy "Mara admins read site orders" on public.mara_orders
using (status <> 'cancelled' and (select public.is_mara_admin()));

alter policy "Mara admins update order status" on public.mara_orders
using (status <> 'cancelled' and (select public.is_mara_admin()))
with check (status in ('pending', 'confirmed') and (select public.is_mara_admin()));

create function public.mara_reject_cancelled_order_retry()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.mara_cancelled_order_requests where request_id = new.request_id
  ) then
    raise exception using errcode = 'PT410', message = 'order_cancelled';
  end if;
  return new;
end;
$$;

revoke all on function public.mara_reject_cancelled_order_retry() from public, anon, authenticated;
create trigger mara_reject_cancelled_order_retry
before insert on public.mara_orders
for each row execute function public.mara_reject_cancelled_order_retry();

create function public.mara_cancel_order(p_order_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_request uuid;
begin
  if not (select public.is_mara_admin()) then
    raise insufficient_privilege using message = 'admin_required';
  end if;

  select request_id into order_request from public.mara_orders where id = p_order_id;
  if not found then return; end if;

  -- Use the same lock as mara_submit_order to serialize submission retries with cancellation.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(order_request::text, 0));
  insert into public.mara_cancelled_order_requests (request_id) values (order_request)
  on conflict do nothing;
  delete from public.mara_orders where id = p_order_id and request_id = order_request;
end;
$$;

revoke all on function public.mara_cancel_order(bigint) from public, anon, authenticated;
grant execute on function public.mara_cancel_order(bigint) to authenticated;

commit;
