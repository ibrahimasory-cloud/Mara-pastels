begin;

create table public.mara_orders (
  id bigint generated always as identity primary key,
  request_id uuid not null unique,
  created_at timestamptz not null default now(),
  first_name text not null,
  last_name text not null,
  address text not null,
  delivery_day text not null check (delivery_day in ('Samedi', 'Dimanche')),
  quantities jsonb not null,
  items jsonb not null,
  subtotal_gnf bigint not null check (subtotal_gnf >= 0),
  sauce_pending boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled'))
);

alter table public.mara_orders enable row level security;
revoke all on public.mara_orders from public, anon, authenticated;
grant select on public.mara_orders to authenticated;
grant update (status) on public.mara_orders to authenticated;

create policy "Mara admins read site orders"
on public.mara_orders for select to authenticated
using ((select public.is_mara_admin()));

create policy "Mara admins update order status"
on public.mara_orders for update to authenticated
using ((select public.is_mara_admin())) with check ((select public.is_mara_admin()));

create function public.mara_submit_order(
  p_request_id uuid,
  p_revision integer,
  p_first_name text,
  p_last_name text,
  p_address text,
  p_delivery_day text,
  p_quantities jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.mara_orders%rowtype;
  site_revision integer;
  site_content jsonb;
  settings jsonb;
  quantity_key text;
  quantity_value text;
  chicken integer;
  meat integer;
  tuna integer;
  king integer;
  sauce integer;
  mini bigint;
  mini_minimum integer;
  mini_price integer;
  king_price integer;
  sauce_price integer;
  mini_title text;
  king_title text;
  sauce_title text;
  total numeric;
  line_items jsonb;
  v_first_name text := pg_catalog.btrim(p_first_name);
  v_last_name text := pg_catalog.btrim(p_last_name);
  v_address text := pg_catalog.btrim(p_address);
begin
  if p_request_id is null or p_revision is null
    or coalesce(pg_catalog.char_length(v_first_name), 0) not between 1 and 80
    or coalesce(pg_catalog.char_length(v_last_name), 0) not between 1 and 80
    or coalesce(pg_catalog.char_length(v_address), 0) not between 1 and 250
    or p_delivery_day is null or p_delivery_day not in ('Samedi', 'Dimanche')
    or pg_catalog.jsonb_typeof(p_quantities) is distinct from 'object'
  then
    raise exception using errcode = 'PT422', message = 'invalid_order';
  end if;

  if p_quantities - array['chicken','meat','tuna','king','sauce'] <> '{}'::jsonb then
    raise exception using errcode = 'PT422', message = 'invalid_order';
  end if;

  foreach quantity_key in array array['chicken','meat','tuna','king','sauce']
  loop
    quantity_value := p_quantities->>quantity_key;
    if pg_catalog.jsonb_typeof(p_quantities->quantity_key) is distinct from 'number'
      or quantity_value !~ '^(0|[1-9][0-9]{0,9})$' then
      raise exception using errcode = 'PT422', message = 'invalid_quantity';
    end if;
    if quantity_value::bigint > 2147483647 then
      raise exception using errcode = 'PT422', message = 'invalid_quantity';
    end if;
  end loop;

  -- Serialize retries for the same request, including after a network timeout.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text, 0));
  select * into order_row from public.mara_orders where request_id = p_request_id;
  if found then
    if (order_row.first_name, order_row.last_name, order_row.address, order_row.delivery_day, order_row.quantities)
      is distinct from (v_first_name, v_last_name, v_address, p_delivery_day, p_quantities) then
      raise exception using errcode = 'PT422', message = 'request_mismatch';
    end if;
  else
    select revision, content into site_revision, site_content
    from public.mara_site where id = 1 for share;
    if site_revision is distinct from p_revision then
      raise exception using errcode = 'PT409', message = 'catalog_changed';
    end if;

    settings := site_content->'settings';
    mini_price := coalesce((settings->>'miniPrice')::integer, 5000);
    king_price := coalesce((settings->>'kingPrice')::integer, 40000);
    mini_minimum := coalesce((settings->>'miniMinimum')::integer, 6);
    sauce_price := (settings->>'saucePrice')::integer;
    mini_title := coalesce(nullif(pg_catalog.btrim(site_content->'texts'->>'product.mini.title'), ''), 'Mini pastels');
    king_title := coalesce(nullif(pg_catalog.btrim(site_content->'texts'->>'product.king.title'), ''), 'Pastel King');
    sauce_title := coalesce(nullif(pg_catalog.btrim(site_content->'texts'->>'product.sauce.title'), ''), 'La sauce magique');

    chicken := (p_quantities->>'chicken')::integer;
    meat := (p_quantities->>'meat')::integer;
    tuna := (p_quantities->>'tuna')::integer;
    king := (p_quantities->>'king')::integer;
    sauce := (p_quantities->>'sauce')::integer;
    mini := chicken::bigint + meat + tuna;
    if (mini = 0 and king = 0)
      or (mini > 0 and (mini < mini_minimum or not coalesce((settings->>'miniAvailable')::boolean, true)))
      or (king > 0 and not coalesce((settings->>'kingAvailable')::boolean, true))
      or sauce > 1 or (sauce = 1 and not coalesce((settings->>'sauceAvailable')::boolean, true))
      or mini_minimum <= 0 or mini_price <= 0 or king_price <= 0 or sauce_price < 0 then
      raise exception using errcode = 'PT422', message = 'invalid_order';
    end if;

    total := mini::numeric * mini_price + king::numeric * king_price + sauce * coalesce(sauce_price, 0);
    if total > 9007199254740991 then
      raise exception using errcode = 'PT422', message = 'invalid_quantity';
    end if;
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('name', line.name, 'quantity', line.qty, 'unit_price', line.price)
      order by line.position
    ) into line_items
    from (values
      (1, mini_title || ' au poulet', chicken, mini_price),
      (2, mini_title || ' à la viande', meat, mini_price),
      (3, mini_title || ' au thon', tuna, mini_price),
      (4, king_title, king, king_price),
      (5, sauce_title, sauce, sauce_price)
    ) as line(position, name, qty, price)
    where line.qty > 0;

    insert into public.mara_orders
      (request_id, first_name, last_name, address, delivery_day, quantities, items, subtotal_gnf, sauce_pending)
    values
      (p_request_id, v_first_name, v_last_name, v_address, p_delivery_day, p_quantities, line_items, total::bigint,
       sauce = 1 and sauce_price is null)
    returning * into order_row;
  end if;

  return pg_catalog.jsonb_build_object(
    'reference', 'MP-' || order_row.id,
    'items', order_row.items,
    'subtotal_gnf', order_row.subtotal_gnf,
    'sauce_pending', order_row.sauce_pending
  );
end;
$$;

revoke all on function public.mara_submit_order(uuid, integer, text, text, text, text, jsonb)
from public, anon, authenticated;
grant execute on function public.mara_submit_order(uuid, integer, text, text, text, text, jsonb)
to anon, authenticated;

commit;
