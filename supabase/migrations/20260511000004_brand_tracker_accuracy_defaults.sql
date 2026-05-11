alter table public.brand_tracker_config
  alter column model_tier set default 'premium',
  alter column runs_per_prompt set default 5;

update public.brand_tracker_config
   set model_tier = 'premium'
 where model_tier = 'balanced';
update public.brand_tracker_config
   set runs_per_prompt = 5
 where runs_per_prompt = 3;
