-- Fix duplicated category prefix in article url_path slugs.
--
-- Example of the bug:
--   category: "Features and Updates"
--   url_path: "features-and-updates/features-updates-skill-studio-ai-s-course-upgrade-revealed"
--   fixed:    "features-and-updates/skill-studio-ai-s-course-upgrade-revealed"
--
-- Matches articles where the slug portion (after the first /) starts
-- with the category portion (before the first /) followed by a hyphen.
-- Also handles the variant where stop words like "and" are dropped
-- from the slug but present in the category folder.

-- Pass 1: exact prefix match (e.g. "compliance/compliance-how-ai...")
UPDATE articles
SET url_path =
  split_part(url_path, '/', 1) || '/' ||
  substring(split_part(url_path, '/', 2) from length(split_part(url_path, '/', 1)) + 2)
WHERE url_path LIKE '%/%'
  AND split_part(url_path, '/', 2) LIKE split_part(url_path, '/', 1) || '-%';

-- Pass 2: prefix without common stop words (e.g. "features-and-updates/features-updates-...")
-- Strip "and", "the", "of", "for", "in", "a" from the category slug, then check
-- if the article slug starts with that shortened form.
UPDATE articles
SET url_path =
  split_part(url_path, '/', 1) || '/' ||
  substring(
    split_part(url_path, '/', 2)
    from length(
      regexp_replace(
        regexp_replace(split_part(url_path, '/', 1), '-(and|the|of|for|in|a)-', '-', 'g'),
        '-(and|the|of|for|in|a)$', '', 'g'
      )
    ) + 2
  )
WHERE url_path LIKE '%/%'
  AND split_part(url_path, '/', 2) LIKE
    regexp_replace(
      regexp_replace(split_part(url_path, '/', 1), '-(and|the|of|for|in|a)-', '-', 'g'),
      '-(and|the|of|for|in|a)$', '', 'g'
    ) || '-%'
  -- Don't re-process rows already fixed by pass 1
  AND split_part(url_path, '/', 2) NOT LIKE split_part(url_path, '/', 1) || '-%';
