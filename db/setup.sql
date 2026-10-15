-- ─────────────────────────────────────────────────────────────────────────────
-- Preparación de la base para JC Influencers.
--
-- Correr UNA VEZ, ANTES de la primera migración, con el usuario dueño de la
-- base (en Neon, `neondb_owner`).
--
-- Por qué hace falta un rol aparte: el dueño de la base tiene **BYPASSRLS**
-- --verificado en Neon el 15/10/2026: `neondb_owner` lo trae puesto-- así que
-- si la aplicación se conectara con él, las políticas de Row-Level Security no
-- se aplicarían y el aislamiento entre clientes desaparecería **sin un solo
-- síntoma**: todo andaría igual, sólo que cada cliente vería lo de los demás.
--
-- Por eso `jc_app` se crea con SQL y con NOBYPASSRLS explícito. En Neon, un rol
-- creado desde la consola web hereda `neon_superuser`, que SÍ trae BYPASSRLS:
-- crearlo desde ahí rompería exactamente lo que este archivo protege.
--
-- La contraseña se pasa por `:clave` (psql) o se sustituye antes de ejecutar.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jc_app') THEN
    CREATE ROLE jc_app LOGIN PASSWORD 'CAMBIAR_ESTA_CLAVE'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
  END IF;
END $$;

-- Acceso al esquema y a lo que ya existe.
GRANT USAGE ON SCHEMA public TO jc_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO jc_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO jc_app;

-- Y a lo que creen las migraciones de acá en adelante.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO jc_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO jc_app;

-- Las migraciones corren con el dueño; que sus objetos hereden el permiso.
DO $$
DECLARE duenio text := current_user;
BEGIN
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public
       GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO jc_app', duenio);
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public
       GRANT USAGE, SELECT ON SEQUENCES TO jc_app', duenio);
END $$;

-- La aplicación no toca la tabla de control de migraciones.
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public._prisma_migrations FROM jc_app';
  END IF;
END $$;
