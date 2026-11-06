-- Audit detail columns for manual review and override (E3-S5). Append-only
-- migration: never edit after it has been applied. Nullable so existing
-- rows and actions without a status change are unaffected.

ALTER TABLE audit_log ADD COLUMN reason_code TEXT;
ALTER TABLE audit_log ADD COLUMN comment TEXT;
ALTER TABLE audit_log ADD COLUMN before_status TEXT;
ALTER TABLE audit_log ADD COLUMN after_status TEXT;
