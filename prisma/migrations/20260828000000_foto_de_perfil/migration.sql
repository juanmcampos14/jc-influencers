-- La foto de un perfil descubierto, guardada por nosotros.
--
-- Las URLs de foto que devuelve influencers.club caducan a las 24 horas y viven
-- en un dominio suyo que nuestro CSP no deja cargar. Guardar la URL era guardar
-- un enlace muerto. Se guarda la imagen: la clave apunta a `stored_blobs` y la
-- sirve la aplicación, en nuestro origen.
ALTER TABLE "discovered_profiles" ADD COLUMN "profileImageKey" TEXT;
