-- Correr DESPUÉS de cada `prisma migrate deploy` en Supabase.
-- Las tablas nuevas nacen con los permisos por defecto, pero esto lo deja explícito
-- y vuelve a sellar la inmutabilidad del log de auditoría.

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO jc_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO jc_app;

REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM jc_app;
REVOKE ALL ON TABLE public._prisma_migrations FROM jc_app;

-- Comprobación 1: ninguna tabla sin Row-Level Security.
SELECT tablename AS tabla_sin_rls
FROM pg_tables
WHERE schemaname = 'public' AND NOT rowsecurity AND tablename <> '_prisma_migrations';

-- Comprobación 2: la auditoría sólo admite lectura e inserción.
SELECT privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'audit_logs' AND grantee = 'jc_app'
ORDER BY privilege_type;
