-- Rol de aplicación: SIN superusuario y SIN BYPASSRLS.
-- Es la barrera que hace que Row-Level Security sea real.
CREATE ROLE jc_app LOGIN PASSWORD 'jc_app_dev_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

GRANT CONNECT ON DATABASE jc_influencers TO jc_app;
GRANT USAGE ON SCHEMA public TO jc_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO jc_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO jc_app;

-- Base para tests de integración, con los mismos permisos.
CREATE DATABASE jc_influencers_test OWNER jc_owner;
GRANT CONNECT ON DATABASE jc_influencers_test TO jc_app;
