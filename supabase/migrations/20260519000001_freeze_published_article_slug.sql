-- Keystone fix for the recurring broken-URL / SEO problem.
--
-- An article's slug IS its live Framer URL. Once an article is published
-- (or has been synced to Framer at all), its slug must never change —
-- title edits and regeneration must not touch it. Enforced at the database
-- level so NO code path (web app, MCP, automations, future code) can ever
-- change a live URL again.

create or replace function public.freeze_published_slug()
returns trigger
language plpgsql
as $function$
begin
  if (old.framer_item_id is not null or old.status = 'published')
     and new.slug is distinct from old.slug then
    -- Silently preserve the live slug. The save still succeeds; only the
    -- slug is held constant, so titles/content update normally.
    raise log 'freeze_published_slug: blocked slug change on % (% -> %)', old.id, old.slug, new.slug;
    new.slug := old.slug;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_freeze_published_slug on articles;
create trigger trg_freeze_published_slug
  before update on articles
  for each row
  execute function public.freeze_published_slug();
