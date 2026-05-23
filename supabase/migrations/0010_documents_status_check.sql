-- Add 'pending' as a valid documents.status value and pin the full set of
-- allowed states with a CHECK constraint.
--
-- 'pending'    = uploaded via the admin UI, waiting for the local ingest script
--                to process it (`python scripts/ingest.py --from-pending`).
-- 'processing' = ingest script has picked it up and is parsing/embedding.
-- 'ready'      = chunks inserted, available to retrieval.
-- 'failed'     = ingestion errored; details in script logs.

alter table documents
  add constraint documents_status_check
  check (status in ('pending', 'processing', 'ready', 'failed'));
