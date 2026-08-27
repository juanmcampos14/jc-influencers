-- Base de conocimiento propia de la agencia.
--
-- Cada búsqueda que se paga deja acá lo que encontró, para que la próxima vez
-- haya que preguntarle menos a un proveedor.
--
-- Es la única tabla sin "clientId", y es a propósito: un perfil de Instagram no
-- le pertenece a ningún cliente. Por eso su política no es de aislamiento por
-- cliente sino de agencia, igual que el permiso para ejecutar scouting.

CREATE TABLE "discovered_profiles" (
    "id" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "url" TEXT NOT NULL,
    "urlNormalized" TEXT NOT NULL,
    "handle" TEXT,
    "displayName" TEXT,
    "followers" INTEGER,
    "engagementRate" DECIMAL(6,3),
    "country" TEXT,
    "bio" TEXT,
    "profileImageUrl" TEXT,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "providers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "timesSeen" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "internalNotes" TEXT,
    "influencerId" TEXT,

    CONSTRAINT "discovered_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "discovered_profile_metrics" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "followers" INTEGER,
    "engagementRate" DECIMAL(6,3),
    "provider" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discovered_profile_metrics_pkey" PRIMARY KEY ("id")
);

-- La identidad del perfil: dos corridas que traen al mismo creador escriben la
-- misma fila en vez de duplicarlo.
CREATE UNIQUE INDEX "discovered_profiles_platform_urlNormalized_key"
    ON "discovered_profiles"("platform", "urlNormalized");
CREATE INDEX "discovered_profiles_platform_followers_idx" ON "discovered_profiles"("platform", "followers");
CREATE INDEX "discovered_profiles_country_idx" ON "discovered_profiles"("country");
CREATE INDEX "discovered_profiles_lastSeenAt_idx" ON "discovered_profiles"("lastSeenAt");
CREATE INDEX "discovered_profiles_influencerId_idx" ON "discovered_profiles"("influencerId");
CREATE INDEX "discovered_profile_metrics_profileId_seenAt_idx"
    ON "discovered_profile_metrics"("profileId", "seenAt");

-- Buscar por palabra clave o interés es buscar DENTRO de un arreglo. Sin estos
-- índices esa consulta recorre la tabla entera, y esta tabla está hecha para
-- crecer sin techo.
CREATE INDEX "discovered_profiles_keywords_idx" ON "discovered_profiles" USING GIN ("keywords");
CREATE INDEX "discovered_profiles_interests_idx" ON "discovered_profiles" USING GIN ("interests");
CREATE INDEX "discovered_profiles_providers_idx" ON "discovered_profiles" USING GIN ("providers");

-- Buscar por texto libre en nombre, usuario y bio. `pg_trgm` permite que
-- "panader" encuentre "panadería" sin recorrer todo.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "discovered_profiles_texto_idx" ON "discovered_profiles"
    USING GIN ((COALESCE("handle", '') || ' ' || COALESCE("displayName", '') || ' ' || COALESCE("bio", '')) gin_trgm_ops);

ALTER TABLE "discovered_profiles"
    ADD CONSTRAINT "discovered_profiles_influencerId_fkey"
    FOREIGN KEY ("influencerId") REFERENCES "influencers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "discovered_profile_metrics"
    ADD CONSTRAINT "discovered_profile_metrics_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "discovered_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Acceso: sólo la agencia. Un usuario de cliente no ve esta tabla ni por error
-- de consulta, porque la base no se lo permite -- no porque la pantalla se lo
-- esconda.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['discovered_profiles','discovered_profile_metrics'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$
      CREATE POLICY agency_only ON %I
        FOR ALL
        USING (app_is_system() OR app_is_agency())
        WITH CHECK (app_is_system() OR app_is_agency())
    $p$, t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jc_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO jc_app', t);
    END IF;
  END LOOP;
END $$;
