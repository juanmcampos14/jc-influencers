-- Permisos QUITADOS a una persona concreta.
--
-- Hasta ahora el rol daba un piso y `extraCapabilities` sólo podía sumar. No
-- había forma de decir "este account manager no ve la plata": había que
-- inventarle un rol nuevo o dejarle de más.
--
-- El permiso efectivo pasa a ser: (lo del rol + los extra) - los quitados, y
-- después el cerrojo de lo que un usuario de cliente nunca puede tener, que se
-- aplica último y no lo levanta nadie.
ALTER TABLE "agency_memberships" ADD COLUMN "deniedCapabilities" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "client_memberships" ADD COLUMN "deniedCapabilities" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- La invitación también los lleva: los permisos se eligen al invitar, no
-- después. Si no viajaran acá, alguien invitado con el árbol entraría con lo
-- que da el rol y habría que volver a ajustarlo a mano.
ALTER TABLE "invitations" ADD COLUMN "deniedCapabilities" TEXT[] DEFAULT ARRAY[]::TEXT[];
