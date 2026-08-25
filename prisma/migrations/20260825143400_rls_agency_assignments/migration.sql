-- RLS para la tabla de asignación agencia↔cliente.
ALTER TABLE agency_client_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON agency_client_assignments
  FOR ALL
  USING (app_client_in_scope("clientId"))
  WITH CHECK (app_client_in_scope("clientId"));
GRANT SELECT, INSERT, UPDATE, DELETE ON agency_client_assignments TO jc_app;
