alter table public.brand_tracker_config
  add column if not exists model_tier text not null default 'balanced'
    check (model_tier in ('fast', 'balanced', 'premium')),
  add column if not exists runs_per_prompt integer not null default 3
    check (runs_per_prompt between 1 and 10),
  add column if not exists web_browsing boolean not null default true,
  add column if not exists use_llm_judge boolean not null default true;

alter table public.brand_tracker_runs
  add column if not exists llm_judge_mentioned boolean,
  add column if not exists llm_judge_sentiment text
    check (llm_judge_sentiment in ('positive', 'neutral', 'negative') or llm_judge_sentiment is null),
  add column if not exists llm_judge_prominence text
    check (llm_judge_prominence in ('primary', 'secondary', 'passing') or llm_judge_prominence is null),
  add column if not exists llm_judge_context text,
  add column if not exists run_index integer not null default 0,
  add column if not exists web_browsing_used boolean not null default false,
  add column if not exists model_tier text;
