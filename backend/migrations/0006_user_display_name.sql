-- Human-readable display name for users. Append-only migration: never edit
-- after it has been applied. Nullable: callers fall back to the email name.
-- Backfills the demo users when they already exist; on a fresh database
-- seed_users() sets the same names when it inserts them.

ALTER TABLE users ADD COLUMN display_name TEXT;

UPDATE users SET display_name = 'Arjun Mehta' WHERE email = 'admin@example.test';
UPDATE users SET display_name = 'Meera Iyer' WHERE email = 'policy@example.test';
UPDATE users SET display_name = 'Rahul Varma' WHERE email = 'underwriter@example.test';
UPDATE users SET display_name = 'Priya Nair' WHERE email = 'customer1@example.test';
UPDATE users SET display_name = 'Karan Shah' WHERE email = 'customer2@example.test';
