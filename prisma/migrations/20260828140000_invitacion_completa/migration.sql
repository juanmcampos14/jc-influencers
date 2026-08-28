-- La invitación lleva sus clientes en su propia columna.
--
-- Venían escondidos dentro de `extraCapabilities` como `__client:<id>`, y eso
-- causaba dos cosas, las dos malas:
--
--  1. La pantalla de usuarios los imprimía como si fueran permisos: alguien
--     veía un chip que decía "__client:cmt99g2h0000004l23086t3bo".
--  2. **Nadie los leía de vuelta.** Al aceptar la invitación, esos marcadores
--     se copiaban tal cual a la membresía y ahí morían: el account manager
--     invitado para dos clientes entraba sin ninguno asignado.
ALTER TABLE "invitations" ADD COLUMN "agencyClientIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Se rescata lo que ya estaba escondido, para las invitaciones sin aceptar.
UPDATE "invitations"
SET "agencyClientIds" = ARRAY(
      SELECT replace(cap, '__client:', '')
      FROM unnest("extraCapabilities") AS cap
      WHERE cap LIKE '__client:%'
    )
WHERE EXISTS (SELECT 1 FROM unnest("extraCapabilities") AS cap WHERE cap LIKE '__client:%');

-- Y se limpia el marcador de donde nunca tuvo que estar.
UPDATE "invitations"
SET "extraCapabilities" = ARRAY(
      SELECT cap FROM unnest("extraCapabilities") AS cap WHERE cap NOT LIKE '__client:%'
    );

-- Lo mismo en las membresías, donde llegó por copia al aceptar.
UPDATE "agency_memberships"
SET "extraCapabilities" = ARRAY(
      SELECT cap FROM unnest("extraCapabilities") AS cap WHERE cap NOT LIKE '__client:%'
    );

UPDATE "client_memberships"
SET "extraCapabilities" = ARRAY(
      SELECT cap FROM unnest("extraCapabilities") AS cap WHERE cap NOT LIKE '__client:%'
    );
