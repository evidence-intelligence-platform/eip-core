-- Read-only role for off-site backups.
--
-- The backup workflow's connection string lives as a secret in a PUBLIC
-- repository. GitHub does not expose secrets to fork pull requests and the
-- workflow is schedule/dispatch only, but the blast radius of that string
-- should still be "can read the data" rather than "owns the database".
--
-- Run once against the production database, as a superuser:
--
--   psql "$ADMIN_DATABASE_URL" -v pw="'a-long-random-password'" \
--        -f scripts/create_backup_role.sql
--
-- Then build the DATABASE_URL secret from this role instead of the owner:
--
--   postgresql://eip_backup:<password>@<host>:<port>/<database>
--
-- Note: pg_dump needs SELECT on every table plus USAGE on the schema, which
-- is what this grants. It does not need write access anywhere.

BEGIN;

-- :pw is passed with -v so the password never appears in this file or in
-- shell history as part of the SQL text.
CREATE ROLE eip_backup WITH LOGIN PASSWORD :pw;

-- CONNECT is granted to PUBLIC by default on a new database, so it is not
-- repeated here. If your database had it revoked, run separately:
--   GRANT CONNECT ON DATABASE <name> TO eip_backup;
GRANT USAGE ON SCHEMA public TO eip_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO eip_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO eip_backup;

-- Tables created later by Alembic migrations must be readable too, otherwise
-- the first backup after a migration silently misses the new table.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO eip_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO eip_backup;

-- Belt and braces: no write path, even if a future grant is careless.
REVOKE CREATE ON SCHEMA public FROM eip_backup;

COMMIT;

-- Verify:
--   \du eip_backup
--   psql "postgresql://eip_backup:...@host/db" -c "\dt"
