-- Applications and their per-product document checklist (E2-S2).
-- Append-only migration: never edit after it has been applied; add a new
-- numbered migration instead. Money is integer paise, never REAL.

CREATE TABLE applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    applicant_user_id INTEGER NOT NULL,
    product_type TEXT NOT NULL,
    requested_amount_paise INTEGER NOT NULL,
    tenure_months INTEGER NOT NULL,
    age_years INTEGER NOT NULL,
    monthly_income_paise INTEGER NOT NULL,
    credit_flags TEXT NOT NULL,
    pan TEXT NOT NULL,
    aadhaar TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    policy_version INTEGER,
    created_at TEXT NOT NULL,
    submitted_at TEXT,
    FOREIGN KEY (applicant_user_id) REFERENCES users (id)
);

CREATE INDEX idx_applications_applicant ON applications (applicant_user_id);

CREATE TABLE application_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'MISSING',
    filename TEXT,
    reason TEXT,
    uploaded_at TEXT,
    verified_by INTEGER,
    verified_at TEXT,
    FOREIGN KEY (application_id) REFERENCES applications (id),
    FOREIGN KEY (verified_by) REFERENCES users (id)
);

CREATE INDEX idx_application_documents_application ON application_documents (application_id);
