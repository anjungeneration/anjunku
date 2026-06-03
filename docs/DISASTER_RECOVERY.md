# ANJUNKU — Disaster Recovery & Backup Guide
**Build Reference: v135 (2026-06-02)**

---

## 1. Migration Run Order

Migrations must be applied in strict order. Each phase depends on the previous.

| Phase | File | Purpose | Depends On |
|-------|------|---------|-----------|
| 0 | `priority1_roadmap.sql` | Base tables: `moderation_history`, soft-delete columns, `restore_soft_deleted()`, `update_member_role()` | Must be FIRST |
| 1 | `phase1_rls_policies.sql` | `get_my_role()` function, all RLS policies | priority1 |
| 7 | `phase7_hardening.sql` | GRANTs, indexes, storage policies, RPCs | phase1 |
| 8 | `phase8_patch_bundle.sql` | `user_id` column on tickers | phase7 |
| 9 | `phase9_moderation_indexes.sql` | `idx_modhistory_action` index | priority1 |
| 10 | `phase10_finance_history_rpc.sql` | `get_finance_history()` RPC | phase1 |
| 11 | `phase11_finance_audit_global_rpc.sql` | `get_finance_audit()` RPC | phase10 |
| 12 | `phase12_bendahara_modhistory_rls.sql` | bendahara RLS on moderation_history | phase1 |
| 13 | `phase13_insert_notif_text_param.sql` | `insert_user_notification()` UUID→TEXT fix | phase1 |
| 14 | `phase14_notification_realtime_fix.sql` | Adds tables to `supabase_realtime` publication | phase1 |
| 15 | `phase15_notification_direct_insert.sql` | GRANT INSERT + insert RLS on notifications | phase1 |
| 16 | `phase16_notifications_ref_id_text.sql` | `ref_id` UUID→TEXT migration | phase15 |
| 17 | `phase17_finance_notification_fix.sql` | Adds `finance`/`moderasi` to type CHECK, bendahara RLS | phase15 |
| 18 | `phase18_notification_types.sql` | Adds `content_pending`, `revision_submitted`, `revision_approved` | phase17 |
| 19 | `phase19_ticker_sponsor_soft_delete.sql` | Soft-delete columns for tickers/sponsors, extends `restore_soft_deleted()` | priority1 |

> **Important:** `phase9` requires `priority1_roadmap.sql` to run first (it creates `moderation_history`).

---

## 2. Fresh Deployment Workflow

Follow this exact sequence for a clean Supabase project:

### Step 1: Database Setup
1. Create Supabase project
2. Open SQL Editor
3. Run migrations **in order** from the table above (priority1 → phase1 → phase7 → ... → phase19)
4. After each migration, verify with the VERIFICATION query at the bottom of each file

### Step 2: Storage Buckets
Create these buckets in Supabase Storage > New Bucket (all **public**):
- `news`
- `products`
- `gallery`
- `transactions`
- `sponsors`

Storage RLS policies are created by `phase7_hardening.sql`.

### Step 3: Realtime
Enable realtime on these tables (or run `phase14`):
- `news`
- `products`
- `notifications`

Dashboard: Database > Replication > supabase_realtime publication > Add tables

### Step 4: App Configuration
Update `script.js` constants:
```javascript
const SUPA_URL = 'https://YOUR_PROJECT.supabase.co';
const SUPA_KEY = 'YOUR_ANON_KEY'; // from Supabase Settings > API
```

### Step 5: First Admin
After deployment, the first user must be manually promoted to `owner` role:
```sql
UPDATE public.profiles SET role = 'owner' WHERE email = 'your@email.com';
```

---

## 3. Disaster Recovery Scenarios

### Scenario A: Accidental Content Deletion
**Symptom:** User reports content missing from news/products/gallery  
**Resolution:**
1. Log in as owner/ketua/admin
2. Navigate to the affected module (e.g., Berita)
3. Soft-deleted items are hidden from all views
4. Use the moderation restore button if visible, OR run SQL:
```sql
-- Find deleted item
SELECT id, title, deleted_at, deleted_by FROM public.news WHERE deleted_at IS NOT NULL;

-- Restore
SELECT restore_soft_deleted('news', 'ITEM_UUID_HERE');
```

**Prevention:** Soft-delete is always used. Hard deletes only happen via `_purgeDeletedContent()` after 30-day grace period.

---

### Scenario B: Sponsor/Ticker Accidentally Deleted
**Since v135**, tickers and sponsors use soft-delete.  
**Resolution:**
```sql
-- Restore ticker
SELECT restore_soft_deleted('tickers', 'TICKER_UUID');

-- Restore sponsor
SELECT restore_soft_deleted('sponsors', 'SPONSOR_UUID');
```

**Before v135:** Hard deletes were permanent. No recovery possible. Prevention: upgrade to v135.

---

### Scenario C: Wrong Role Assigned to User
**Resolution:**
1. Log in as owner
2. Go to Anggota > find user > click role button
3. Select correct role
OR via SQL:
```sql
SELECT update_member_role('USER_UUID', 'anggota'); -- target role
```
Valid roles: `owner`, `ketua`, `admin`, `bendahara`, `anggota`

Notification will be sent to user automatically (role_changed type).

---

### Scenario D: Notification Type Constraint Error (23514)
**Symptom:** Notifications silently fail; console shows `code: 23514`  
**Cause:** New notification type not in `notifications_type_check` constraint  
**Valid types (v135):** `content_deleted`, `content_approved`, `content_rejected`, `content_pending`, `revision_submitted`, `revision_approved`, `role_changed`, `gallery_approved`, `gallery_rejected`, `finance`, `moderasi`

**Resolution:** Run a new phase migration adding the new type to the CHECK constraint (pattern from phase18).

---

### Scenario E: Storage Orphan Accumulation
**Symptom:** Supabase Storage filling up; deleted content media not cleaned  
**Resolution:**
1. Log in as owner
2. Dashboard > User Management > Storage Cleanup section
3. Click purge buttons for each table (only purges items deleted >30 days ago, 50 rows at a time)
4. Repeat until "tidak ada data" message appears

Manual SQL (dangerous — use only if UI unavailable):
```sql
-- Find candidates (older than 30 days)
SELECT id, image_url, deleted_at FROM public.news
WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days';
-- Then manually delete storage files via Supabase Storage UI before hard-deleting rows
```

---

### Scenario F: Realtime Notifications Stopped Working
**Symptom:** Bell notifications not arriving without page refresh  
**Checklist:**
1. Verify tables are in `supabase_realtime` publication (run phase14 if needed)
2. Check browser console for `[realtime] notif-feed status:` logs
3. Supabase Dashboard > Realtime > check connection

Do NOT modify `_subscribeNotifs()` — it reconnects on auth state change automatically.

---

## 4. Daily Backup Checklist

Supabase manages automated daily backups on Pro plans. For additional safety:

- [ ] Weekly: Export `profiles` table via Supabase Table Editor > Export CSV
- [ ] Weekly: Export `transactions` table (financial records)
- [ ] Monthly: Run `_purgeDeletedContent()` for all tables to keep storage clean
- [ ] Monthly: Verify all migration phases are applied (compare against the table in Section 1)
- [ ] Before any major deployment: Snapshot the database via Supabase Dashboard > Database > Backups

---

## 5. Key Environment Variables

| Variable | Location | Description |
|----------|----------|-------------|
| `SUPA_URL` | `script.js` line 7 | Supabase project URL |
| `SUPA_KEY` | `script.js` line 8 | Supabase anon/public key |
| `CACHE` | `sw.js` | Service worker cache version — increment on JS/CSS updates |

> **Note:** `SUPA_KEY` is the anon key (safe to expose in frontend). Never expose the `service_role` key.

---

## 6. Critical Constraints (Never Violate)

- **JANGAN MENYENTUH AUTH** — Supabase auth flows are stable; changes break login
- **JANGAN MENYENTUH SW** (`sw.js`) — Service worker cache must be incremented carefully; wrong version = broken PWA offline
- **JANGAN MENYENTUH RLS** — Row Level Security protects all data; broken policies = data exposure
- **JANGAN MENYENTUH FINANCE LOGIC** — Finance calculations (allTrx, calcFinSummary) feed the chart; changes break dashboard
- **PATCH MODULAR ONLY** — Always add functions, never rewrite entire modules

---

*Last updated: 2026-06-02 — v135*
