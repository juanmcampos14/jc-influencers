-- Archivar una campaña: que no aparezca más en la lista y que el cliente no la vea.
--
-- No alcanzaba con CLOSED ni con CANCELLED. Esos dos dicen QUÉ PASÓ con la
-- campaña --terminó, o no llegó a pasar-- y son información que el reporte de
-- fin de año necesita. Archivar dice otra cosa: "no la quiero ver más". Son
-- ejes distintos, y meterlos en el mismo campo obligaría a elegir entre
-- esconder una campaña y registrar cómo terminó.
--
-- Nulo = a la vista. Con fecha = archivada, y se sabe cuándo.
ALTER TABLE "campaigns" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- La lista pide siempre "las de este cliente que no están archivadas".
CREATE INDEX "campaigns_clientId_archivedAt_idx" ON "campaigns"("clientId", "archivedAt");
