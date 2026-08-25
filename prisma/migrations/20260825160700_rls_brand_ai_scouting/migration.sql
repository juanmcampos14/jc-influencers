-- RLS para las tablas nuevas: identidad visual, análisis con IA y scouting.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['client_brands','ai_insights','scouting_runs','scouting_results'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$
      CREATE POLICY tenant_isolation ON %I
        FOR ALL
        USING (app_client_in_scope("clientId"))
        WITH CHECK (app_client_in_scope("clientId"))
    $p$, t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jc_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO jc_app', t);
    END IF;
  END LOOP;
END $$;

-- El presupuesto de scouting admite un tope global de agencia (clientId nulo).
ALTER TABLE scouting_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON scouting_budgets
  FOR ALL
  USING ("clientId" IS NULL AND (app_is_system() OR app_is_agency()) OR app_client_in_scope("clientId"))
  WITH CHECK ("clientId" IS NULL AND (app_is_system() OR app_is_agency()) OR app_client_in_scope("clientId"));
-- Los permisos del rol de aplicación se otorgan sólo si el rol ya existe.
-- En un servidor nuevo (Supabase) el rol se crea con `supabase/setup.sql` antes
-- de migrar; guardarlo evita que la migración falle a mitad de camino.
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jc_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON scouting_budgets TO jc_app';
  END IF;
END $grants$;

