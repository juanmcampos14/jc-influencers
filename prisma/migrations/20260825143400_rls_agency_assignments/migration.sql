-- RLS para la tabla de asignación agencia↔cliente.
ALTER TABLE agency_client_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agency_client_assignments
  FOR ALL
  USING (app_client_in_scope("clientId"))
  WITH CHECK (app_client_in_scope("clientId"));
-- Los permisos del rol de aplicación se otorgan sólo si el rol ya existe.
-- En un servidor nuevo (Supabase) el rol se crea con `supabase/setup.sql` antes
-- de migrar; guardarlo evita que la migración falle a mitad de camino.
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jc_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON agency_client_assignments TO jc_app';
  END IF;
END $grants$;

