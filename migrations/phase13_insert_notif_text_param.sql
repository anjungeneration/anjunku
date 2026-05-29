-- ═══════════════════════════════════════════════════════════════════════════
-- ANJUNKU — Phase 13 insert_user_notification UUID → TEXT param fix
-- Date    : 2026-05-29
-- Build   : v126
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste & run this entire file.
--   Idempotent (safe to re-run).
--
-- WHY:
--   insert_user_notification(p_user_id UUID) — PostgREST receives UUID values
--   from JS as JSON strings. If the schema cache resolves the call with a text
--   literal and PostgreSQL can't implicitly cast text → uuid (assignment-level
--   cast, not implicit), the RPC fails with 42702, silently swallowed by the
--   JS catch block → no notifications delivered.
--   Fix: change p_user_id to TEXT, cast to UUID internally.
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop old UUID-typed overload
DROP FUNCTION IF EXISTS public.insert_user_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.insert_user_notification(
  p_user_id   TEXT,
  p_type      TEXT,
  p_title     TEXT,
  p_message   TEXT,
  p_ref_table TEXT DEFAULT NULL,
  p_ref_id    TEXT DEFAULT NULL,
  p_actor     TEXT DEFAULT NULL,
  p_reason    TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
  target_uid  UUID;
BEGIN
  -- Must be authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'insert_user_notification: unauthenticated caller';
  END IF;

  -- Must be owner / ketua / admin
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  IF caller_role NOT IN ('owner', 'ketua', 'admin') THEN
    RAISE EXCEPTION 'insert_user_notification: caller role % is not authorized', caller_role;
  END IF;

  -- Input validation
  IF LENGTH(COALESCE(p_type,''))    = 0 THEN RAISE EXCEPTION 'p_type required'; END IF;
  IF LENGTH(COALESCE(p_title,''))   = 0 THEN RAISE EXCEPTION 'p_title required'; END IF;
  IF LENGTH(COALESCE(p_message,'')) = 0 THEN RAISE EXCEPTION 'p_message required'; END IF;
  IF LENGTH(p_type)    > 50   THEN RAISE EXCEPTION 'p_type too long'; END IF;
  IF LENGTH(p_title)   > 200  THEN RAISE EXCEPTION 'p_title too long'; END IF;
  IF LENGTH(p_message) > 1000 THEN RAISE EXCEPTION 'p_message too long'; END IF;

  -- Cast TEXT → UUID (raises invalid_text_representation if malformed)
  target_uid := p_user_id::UUID;

  -- Silently skip self-notifications
  IF target_uid = auth.uid() THEN RETURN; END IF;

  -- Target must exist
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = target_uid) THEN
    RAISE EXCEPTION 'insert_user_notification: target user % not found', target_uid;
  END IF;

  INSERT INTO public.notifications
    (user_id, type, title, message, ref_table, ref_id, actor_name, reason, created_at, is_read)
  VALUES
    (target_uid, p_type, p_title, p_message,
     p_ref_table, p_ref_id, p_actor, p_reason, NOW(), FALSE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_user_notification(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────
-- SELECT proname, pronargs FROM pg_proc
-- JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
-- WHERE nspname = 'public' AND proname = 'insert_user_notification';
-- ═══════════════════════════════════════════════════════════════════════════
-- END OF PHASE 13
-- ═══════════════════════════════════════════════════════════════════════════
