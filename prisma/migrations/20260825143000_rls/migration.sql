-- ─────────────────────────────────────────────────────────────────────────────
-- Row-Level Security: SEGUNDA barrera de aislamiento entre tenants.
-- La autorización de aplicación sigue siendo obligatoria; esto es la red debajo.
--
-- Contexto por request (GUCs, seteados con SET LOCAL dentro de la transacción):
--   app.user_id      id del usuario de la sesión
--   app.scope        'agency' | 'client' | 'none'
--   app.client_ids   ids de cliente a los que la sesión tiene acceso (coma)
--   app.all_clients  'on' para roles de agencia con alcance total
--   app.system       'on' SOLO para el flujo de autenticación / bootstrap
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION app_user_id() RETURNS text
  LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')
$$;

CREATE OR REPLACE FUNCTION app_client_ids() RETURNS text[]
  LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT COALESCE(string_to_array(NULLIF(current_setting('app.client_ids', true), ''), ','), ARRAY[]::text[])
$$;

CREATE OR REPLACE FUNCTION app_all_clients() RETURNS boolean
  LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT COALESCE(NULLIF(current_setting('app.all_clients', true), ''), 'off') = 'on'
$$;

CREATE OR REPLACE FUNCTION app_is_agency() RETURNS boolean
  LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT COALESCE(NULLIF(current_setting('app.scope', true), ''), 'none') = 'agency'
$$;

CREATE OR REPLACE FUNCTION app_is_system() RETURNS boolean
  LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT COALESCE(NULLIF(current_setting('app.system', true), ''), 'off') = 'on'
$$;

-- Un cliente está en alcance si la sesión es de sistema, tiene alcance total,
-- o el id figura explícitamente entre sus membresías resueltas en base.
CREATE OR REPLACE FUNCTION app_client_in_scope(cid text) RETURNS boolean
  LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT app_is_system() OR app_all_clients() OR (cid IS NOT NULL AND cid = ANY(app_client_ids()))
$$;

-- ── Tablas con columna client_id obligatoria ────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'client_memberships','campaigns','campaign_assignments','campaign_links',
    'campaign_documents','campaign_briefs','brief_niches','brief_keywords',
    'brief_clusters','candidacies','candidacy_status_events','deliverables',
    'comments','import_runs','import_row_logs'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$
      CREATE POLICY tenant_isolation ON %I
        FOR ALL
        USING (app_client_in_scope("clientId"))
        WITH CHECK (app_client_in_scope("clientId"))
    $p$, t);
  END LOOP;
END $$;

-- ── Tablas con client_id opcional (alcance de agencia cuando es NULL) ───────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['invitations','source_references','audit_logs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$
      CREATE POLICY tenant_isolation ON %I
        FOR ALL
        USING ("clientId" IS NULL AND (app_is_system() OR app_is_agency()) OR app_client_in_scope("clientId"))
        WITH CHECK ("clientId" IS NULL AND (app_is_system() OR app_is_agency()) OR app_client_in_scope("clientId"))
    $p$, t);
  END LOOP;
END $$;

-- ── clients: el tenant se identifica por su propio id ───────────────────────
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON clients
  FOR ALL
  USING (app_client_in_scope(id))
  WITH CHECK (app_client_in_scope(id));

-- La creación de un cliente nuevo sólo ocurre en contexto de sistema o de un
-- rol de agencia con alcance total; el INSERT lo cubre app_client_in_scope
-- porque app_all_clients() ya es true para esos roles.

-- ── Base global de influencers ──────────────────────────────────────────────
-- Agencia: acceso total. Cliente: sólo influencers con una candidatura visible
-- en una campaña de alguno de sus clientes.
ALTER TABLE influencers ENABLE ROW LEVEL SECURITY;
CREATE POLICY influencer_scope ON influencers
  FOR ALL
  USING (
    app_is_system() OR app_is_agency() OR EXISTS (
      SELECT 1 FROM candidacies c
      WHERE c."influencerId" = influencers.id
        AND c."clientVisible" = true
        AND app_client_in_scope(c."clientId")
    )
  )
  WITH CHECK (app_is_system() OR app_is_agency());

ALTER TABLE social_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY social_profile_scope ON social_profiles
  FOR ALL
  USING (EXISTS (SELECT 1 FROM influencers i WHERE i.id = social_profiles."influencerId"))
  WITH CHECK (app_is_system() OR app_is_agency());

ALTER TABLE metric_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY metric_snapshot_scope ON metric_snapshots
  FOR ALL
  USING (EXISTS (SELECT 1 FROM social_profiles p WHERE p.id = metric_snapshots."socialProfileId"))
  WITH CHECK (app_is_system() OR app_is_agency());

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['influencer_niches','influencer_tags','influencer_duplicates'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$
      CREATE POLICY agency_only ON %I
        FOR ALL USING (app_is_system() OR app_is_agency())
        WITH CHECK (app_is_system() OR app_is_agency())
    $p$, t);
  END LOOP;
END $$;

-- ── Usuarios: uno mismo, la agencia, o compañeros del mismo tenant ──────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_scope ON users
  FOR ALL
  USING (
    app_is_system() OR app_is_agency() OR id = app_user_id() OR EXISTS (
      SELECT 1 FROM client_memberships m
      WHERE m."userId" = users.id AND app_client_in_scope(m."clientId")
    )
  )
  WITH CHECK (app_is_system() OR app_is_agency());

ALTER TABLE agency_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY agency_membership_scope ON agency_memberships
  FOR ALL
  USING (app_is_system() OR app_is_agency() OR "userId" = app_user_id())
  WITH CHECK (app_is_system() OR app_is_agency());

-- ── Preferencias: siempre del propio usuario ────────────────────────────────
ALTER TABLE saved_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_views ON saved_views
  FOR ALL
  USING (app_is_system() OR "userId" = app_user_id())
  WITH CHECK (app_is_system() OR "userId" = app_user_id());

-- ── Tablas de infraestructura de autenticación: sólo contexto de sistema ────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['sessions','password_resets','rate_limit_counters','email_outbox'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$
      CREATE POLICY system_only ON %I
        FOR ALL USING (app_is_system()) WITH CHECK (app_is_system())
    $p$, t);
  END LOOP;
END $$;

-- ── Catálogos: lectura para todos, escritura sólo agencia/sistema ───────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['niches','tags','candidacy_status_defs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY catalog_read ON %I FOR SELECT USING (true)', t);
    EXECUTE format($p$
      CREATE POLICY catalog_write ON %I FOR ALL
        USING (app_is_system() OR app_is_agency())
        WITH CHECK (app_is_system() OR app_is_agency())
    $p$, t);
  END LOOP;
END $$;

-- ── Permisos explícitos del rol de aplicación ───────────────────────────────
-- Los permisos del rol de aplicación se otorgan sólo si el rol ya existe.
-- En un servidor nuevo (Supabase) el rol se crea con `supabase/setup.sql` antes
-- de migrar; guardarlo evita que la migración falle a mitad de camino.
DO $grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jc_app') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA public TO jc_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO jc_app';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO jc_app';
    EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM jc_app';
  END IF;
END $grants$;


-- Las migraciones las corre el rol propietario, no la aplicación.
-- (En la shadow database de `prisma migrate dev` la tabla puede no existir todavía.)
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "_prisma_migrations" FROM jc_app';
  END IF;
END $$;
