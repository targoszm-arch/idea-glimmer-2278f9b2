-- Phase 2: resolve the 5 duplicate-slug pairs, then enforce uniqueness.
-- See PR — slug immutability / SEO fix.

-- 4 accidental duplicate DRAFTS (live published originals kept untouched).
update articles
set status = 'archived',
    slug = slug || '-dup-' || left(id::text, 8)
where id in (
  '17b8c417-21c1-4093-bb3b-e3e25a4cd5cd',
  'b9041117-b267-4c4a-b7af-f721d675d590',
  'e27a3c1b-2b50-4e17-a02f-d3f2a1e82d0d',
  'b889f8af-b708-4ed8-9b4f-68b861bbe83e'
);

-- top-12 collision: two PUBLISHED rows shared one slug. Keep a533ea26
-- (newer/fuller); retire the older 5fe010e1.
update articles
set status = 'archived', framer_item_id = null
where id = '5fe010e1-8028-4dbb-a49d-b24b70c0a8c1';

update articles
set slug = slug || '-archived-5fe010e1'
where id = '5fe010e1-8028-4dbb-a49d-b24b70c0a8c1';

alter table articles
  add constraint articles_user_slug_unique unique (user_id, slug);
