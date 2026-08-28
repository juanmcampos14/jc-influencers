-- Un archivo sin cliente tiene que poder crearse.
--
-- La política de `stored_blobs` dejaba leer y escribir un blob sin cliente sólo
-- con `app_is_agency()`. Pero el almacenamiento, cuando no hay cliente dueño,
-- corre en scope de SISTEMA --que no es lo mismo-- y la inserción se rechazaba
-- con "new row violates row-level security policy".
--
-- Nunca había molestado porque hasta ahora ningún archivo era de la agencia:
-- el propio comentario de aquella migración decía "por ahora no se crea
-- ninguno". Las fotos de los perfiles descubiertos son los primeros.
--
-- Se suma `app_is_system()` al caso de cliente nulo, igual que ya hace
-- `scouting_budgets` con el tope global. Un usuario de cliente sigue sin ver
-- nada: ese lado de la condición no se toca.
DROP POLICY IF EXISTS tenant_isolation ON "stored_blobs";

CREATE POLICY tenant_isolation ON "stored_blobs"
  FOR ALL
  USING (
    "clientId" IS NOT NULL AND app_client_in_scope("clientId")
    OR "clientId" IS NULL AND (app_is_system() OR app_is_agency())
  )
  WITH CHECK (
    "clientId" IS NOT NULL AND app_client_in_scope("clientId")
    OR "clientId" IS NULL AND (app_is_system() OR app_is_agency())
  );
