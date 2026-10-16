-- Search without embeddings (PREPO.md §1.3): tsvector for ranking, pg_trgm for
-- typo tolerance. Claude reads the retrieved passages.

create or replace function transcript_segments_tsv() returns trigger
language plpgsql as $$
begin
  new.tsv := to_tsvector('english', coalesce(new.text, ''));
  return new;
end
$$;

drop trigger if exists transcript_segments_tsv_trg on transcript_segments;
create trigger transcript_segments_tsv_trg
  before insert or update of text on transcript_segments
  for each row execute function transcript_segments_tsv();

update transcript_segments set tsv = to_tsvector('english', coalesce(text, ''));

create index if not exists transcript_segments_tsv_idx
  on transcript_segments using gin (tsv);

do $$
begin
  create extension if not exists pg_trgm;
  execute 'create index if not exists transcript_segments_trgm_idx '
       || 'on transcript_segments using gin (text gin_trgm_ops)';
exception when others then
  raise notice 'pg_trgm unavailable, skipping trigram index: %', sqlerrm;
end
$$;
