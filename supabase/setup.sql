-- ─────────────────────────────────────────────────────────────────────────────
-- Preparación de una base Supabase para JC Influencers.
--
-- Correr UNA VEZ en el SQL Editor de Supabase, ANTES de la primera migración.
-- Reemplazar CAMBIAR_ESTA_CLAVE por una contraseña larga y aleatoria:
--     openssl rand -base64 36
--
-- Por qué hace falta: el rol `postgres` de Supabase tiene BYPASSRLS, así que si
-- la aplicación se conectara con él, las políticas de Row-Level Security no se
-- aplicarían y perderíamos la tercera barrera de aislamiento entre clientes.
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

-- Supabase usa el rol `postgres` para migrar; que sus objetos hereden el permiso.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO jc_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO jc_app;

-- La aplicación no toca la tabla de control de migraciones.
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public._prisma_migrations FROM jc_app';
  END IF;
END $$;

-- Comprobación: tiene que devolver bypassrls = false.
SELECT rolname, rolsuper AS superusuario, rolbypassrls AS bypassrls
FROM pg_roles WHERE rolname IN ('jc_app', 'postgres');
