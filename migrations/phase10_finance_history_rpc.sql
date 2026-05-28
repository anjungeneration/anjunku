-- ═══════════════════════════════════════════════════════════════════════════
-- ANJUNKU — Phase 10 Finance History RPC
-- Date    : 2026-05-28
-- Build   : v119
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste & run this entire file.
--   All statements are idempotent (safe to re-run).
--
-- COVERS:
--   get_finance_history(p_record_id UUID)
--     SECURITY DEFINER — bypasses moderation_history RLS (which only allows
--     owner/ketua to SELECT) so that bendahara can also read finance audit
--     entries for transactions they manage.
--     Access: owner / ketua / bendahara only.
--     Returns last 20 rows for the given transaction ID.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_finance_history(p_record_id UUID)
RETURNS TABLE (
  id          UUID,
  action      TEXT,
  actor_name  TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'get_finance_history: unauthenticated';
  END IF;

  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  IF caller_role NOT IN ('owner', 'ketua', 'bendahara') THEN
    RAISE EXCEPTION 'get_finance_history: role % not authorized', caller_role;
  END IF;

  RETURN QUERY
  SELECT h.id, h.action, h.actor_name, h.metadata, h.created_at
  FROM public.moderation_history h
  WHERE h.table_name = 'transactions'
    AND h.record_id  = p_record_id::TEXT
    AND h.action IN ('finance_create', 'finance_update', 'finance_delete')
  ORDER BY h.created_at DESC
  LIMIT 20;
END;
$$;

-- Grant to authenticated (RPC itself enforces role check internally)
GRANT EXECUTE ON FUNCTION public.get_finance_history(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICATION QUERIES
-- ─────────────────────────────────────────────────────────────────────────
-- 1. Confirm function exists with correct security:
-- SELECT proname, prosecdef, proconfig
-- FROM pg_proc JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
-- WHERE nspname = 'public' AND proname = 'get_finance_history';
--
-- 2. Test call (as authenticated user with finance role):
-- SELECT * FROM get_finance_history('<transaction-uuid-here>');
-- ═══════════════════════════════════════════════════════════════════════════
-- END OF PHASE 10
-- ═══════════════════════════════════════════════════════════════════════════
