-- Policy versions (E2-S1). Append-only migration: never edit after it has
-- been applied; add a new numbered migration instead.

CREATE TABLE policy_versions (
    version INTEGER PRIMARY KEY,
    status TEXT NOT NULL,
    file_path TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    base_version INTEGER,
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    approved_by INTEGER,
    approved_at TEXT,
    FOREIGN KEY (base_version) REFERENCES policy_versions (version),
    FOREIGN KEY (created_by) REFERENCES users (id),
    FOREIGN KEY (approved_by) REFERENCES users (id)
);

-- Append-only: no row is ever deleted, and the only permitted update is the
-- one DRAFT -> APPROVED transition (FA-F1.2..F1.5).
CREATE TRIGGER trg_policy_versions_no_delete
BEFORE DELETE ON policy_versions
BEGIN
    SELECT RAISE(ABORT, 'policy_versions is append-only: delete forbidden');
END;

CREATE TRIGGER trg_policy_versions_no_bad_update
BEFORE UPDATE ON policy_versions
WHEN NOT (OLD.status = 'DRAFT' AND NEW.status = 'APPROVED')
BEGIN
    SELECT RAISE(ABORT, 'policy_versions only allows the DRAFT->APPROVED transition');
END;
