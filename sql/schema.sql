begin;

create extension if not exists pgcrypto;

create table public.stores (
  id uuid primary key default gen_random_uuid(),

  owner_id uuid not null unique
    references auth.users(id) on delete cascade,

  slug text not null unique,
  name text not null,
  description text not null default '',
  whatsapp text not null,

  is_public boolean not null default false,
  listed boolean not null default false,
  deleting boolean not null default false,

  -- Controlled administratively, not by sellers.
  feature_rank integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint store_slug_format check (
    length(slug) between 3 and 40
    and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),

  constraint store_slug_reserved check (
    slug not in (
      'www', 'api', 'admin', 'app', 'auth', 'mail', 'email',
      'support', 'help', 'static', 'assets', 'cdn',
      'dashboard', 'account', 'billing', 'status',
      'dev', 'test', 'staging', 'localhost'
    )
  ),

  constraint store_name_length check (
    length(name) between 1 and 100
  ),

  constraint store_description_length check (
    length(description) <= 1000
  ),

  constraint store_whatsapp_format check (
    whatsapp ~ '^[1-9][0-9]{7,14}$'
  )
);

create table public.products (
  id uuid primary key default gen_random_uuid(),

  store_id uuid not null
    references public.stores(id) on delete cascade,

  kind text not null default 'product'
    check (kind in ('product', 'about')),

  image_path text,
  title text not null default 'Untitled product',
  description text not null default '',
  price text not null default '',

  pinned boolean not null default false,
  enabled boolean not null default true,
  position integer not null default 0,

  generation_status text not null default 'pending'
    check (
      generation_status in ('pending', 'ready', 'failed')
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint product_title_length check (
    length(title) between 1 and 120
  ),

  constraint product_description_length check (
    length(description) <= 3000
  ),

  constraint product_price_length check (
    length(price) <= 40
  ),

  constraint product_image_required check (
    kind = 'about' or image_path is not null
  ),

  constraint product_image_store_prefix check (
    image_path is null
    or image_path like store_id::text || '/%'
  )
);

create index products_store_order
on public.products (
  store_id,
  pinned desc,
  position,
  created_at
);

create index stores_public_discovery
on public.stores (
  feature_rank desc,
  created_at desc
)
where is_public and listed and not deleting;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger stores_updated_at
before update on public.stores
for each row execute function public.touch_updated_at();

create trigger products_updated_at
before update on public.products
for each row execute function public.touch_updated_at();

alter table public.stores enable row level security;
alter table public.products enable row level security;

-- The browser never writes directly to these tables.
-- All writes go through the Worker, which validates ownership and input.
revoke all on public.stores from anon, authenticated;
revoke all on public.products from anon, authenticated;

grant select on public.stores to authenticated;
grant select on public.products to authenticated;

grant all on public.stores to service_role;
grant all on public.products to service_role;

create policy seller_reads_own_store
on public.stores
for select
to authenticated
using (owner_id = (select auth.uid()));

create policy seller_reads_own_products
on public.products
for select
to authenticated
using (
  exists (
    select 1
    from public.stores s
    where s.id = products.store_id
      and s.owner_id = (select auth.uid())
  )
);

-- Atomically creates a store and its initial product rows.
-- Storage files are uploaded by the Worker before this RPC.
-- If the transaction fails, the Worker removes those uploaded files.
create or replace function public.create_seller_store(
  p_store_id uuid,
  p_owner_id uuid,
  p_slug text,
  p_whatsapp text,
  p_products jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item jsonb;
  count_items integer;
begin
  count_items := jsonb_array_length(p_products);

  if count_items < 1 or count_items > 3 then
    raise exception 'Between one and three product images are required.';
  end if;

  insert into public.stores (
    id, owner_id, slug, name, whatsapp
  )
  values (
    p_store_id,
    p_owner_id,
    p_slug,
    initcap(replace(p_slug, '-', ' ')),
    p_whatsapp
  );

  for item in
    select value from jsonb_array_elements(p_products)
  loop
    insert into public.products (
      id,
      store_id,
      image_path,
      title,
      position,
      generation_status
    )
    values (
      (item->>'id')::uuid,
      p_store_id,
      item->>'image_path',
      'Untitled product',
      (item->>'position')::integer,
      'pending'
    );
  end loop;

  return p_store_id;
end;
$$;

-- One representative product per store, up to eight stores.
create or replace function public.featured_stores()
returns table (
  slug text,
  store_name text,
  product_id uuid,
  title text,
  price text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    s.slug,
    s.name as store_name,
    p.id as product_id,
    p.title,
    p.price
  from public.stores s
  cross join lateral (
    select
      x.id,
      x.title,
      x.price
    from public.products x
    where x.store_id = s.id
      and x.kind = 'product'
      and x.enabled
    order by
      x.pinned desc,
      x.position,
      x.created_at
    limit 1
  ) p
  where s.is_public
    and s.listed
    and not s.deleting
  order by
    s.feature_rank desc,
    s.created_at desc,
    s.id
  limit 8;
$$;

revoke all on function public.create_seller_store(
  uuid, uuid, text, text, jsonb
) from public, anon, authenticated;

revoke all on function public.featured_stores()
from public, anon, authenticated;

grant execute on function public.create_seller_store(
  uuid, uuid, text, text, jsonb
) to service_role;

grant execute on function public.featured_stores()
to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'store-images',
  'store-images',
  false,
  524288,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No browser storage policies are installed.
-- Files are uploaded and served exclusively through the Worker.
-- The bucket must remain PRIVATE.

commit;
