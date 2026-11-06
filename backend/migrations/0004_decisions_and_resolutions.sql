-- Underwriting decisions and manual-review/override resolutions. Append-only
-- migration: never edit after it has been applied; add a new numbered
-- migration instead.

CREATE TABLE decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL UNIQUE,
    decision TEXT NOT NULL,
    score INTEGER NOT NULL,
    reason_codes TEXT NOT NULL,
    policy_version INTEGER NOT NULL,
    decided_at TEXT NOT NULL,
    FOREIGN KEY (application_id) REFERENCES applications (id),
    FOREIGN KEY (policy_version) REFERENCES policy_versions (version)
);

CREATE TRIGGER trg_decisions_no_update BEFORE UPDATE ON decisions
BEGIN SELECT RAISE(ABORT, 'decisions is append-only: update forbidden'); END;

CREATE TRIGGER trg_decisions_no_delete BEFORE DELETE ON decisions
BEGIN SELECT RAISE(ABORT, 'decisions is append-only: delete forbidden'); END;

CREATE TABLE resolutions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL UNIQUE,
    kind TEXT NOT NULL,
    outcome TEXT NOT NULL,
    reason_code TEXT,
    comment TEXT NOT NULL,
    resolved_by INTEGER NOT NULL,
    resolved_at TEXT NOT NULL,
    FOREIGN KEY (application_id) REFERENCES applications (id),
    FOREIGN KEY (resolved_by) REFERENCES users (id)
);

CREATE TRIGGER trg_resolutions_no_update BEFORE UPDATE ON resolutions
BEGIN SELECT RAISE(ABORT, 'resolutions is append-only: update forbidden'); END;

CREATE TRIGGER trg_resolutions_no_delete BEFORE DELETE ON resolutions
BEGIN SELECT RAISE(ABORT, 'resolutions is append-only: delete forbidden'); END;
