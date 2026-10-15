-- Correr DESPUÉS de cada `prisma migrate deploy`.
-- Las tablas nuevas nacen con los permisos por defecto, pero esto lo deja
-- explícito y vuelve a sellar la inmutabilidad del log de auditoría.

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO jc_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO jc_app;

REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM jc_app;
REVOKE ALL ON TABLE public._prisma_migrations FROM jc_app;
