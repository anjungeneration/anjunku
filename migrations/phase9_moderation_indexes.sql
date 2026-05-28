-- ═══════════════════════════════════════════════════════════════════════════
-- ANJUNKU — Phase 9 Moderation History Index Hardening
-- Date    : 2026-05-28
-- Build   : v118
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste & run this entire file.
--   All statements are idempotent (safe to re-run).
--
-- EXISTING indexes (from priority1_roadmap.sql — already applied):
--   idx_modhistory_actor   ON moderation_history(actor_id, created_at DESC)
--   idx_modhistory_record  ON moderation_history(table_name, record_id, created_at DESC)
--   idx_modhistory_created ON moderation_history(created_at DESC)
--
-- ADDS:
--   idx_modhistory_action  ON moderation_history(action, created_at DESC)
--     Supports queries that filter by action type
--     (e.g. "show all finance_delete events" or "show all ticker_delete events").
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_modhistory_action
ON public.moderation_history(action, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICATION QUERIES
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Confirm all moderation_history indexes:
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public' AND tablename = 'moderation_history'
-- ORDER BY indexname;

-- 2. Check table size and row count:
-- SELECT relname, n_live_tup AS live_rows,
--        pg_size_pretty(pg_total_relation_size(oid)) AS total_size
-- FROM pg_stat_user_tables
-- WHERE relname = 'moderation_history';

-- 3. Sample recent entries by action type:
-- SELECT action, COUNT(*) AS cnt, MAX(created_at) AS last_seen
-- FROM public.moderation_history
-- GROUP BY action
-- ORDER BY cnt DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- END OF PHASE 9
-- ═══════════════════════════════════════════════════════════════════════════
