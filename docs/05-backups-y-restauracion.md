# Backups y restauración

## Qué hay que respaldar

| Qué | Dónde | Criticidad |
| --- | --- | --- |
| Base de datos PostgreSQL | `jc_influencers` | **Crítica.** Es todo el producto. |
| Archivos subidos | `./storage` (local) o el bucket S3 | Alta. Excels importados y documentos de campaña. |
| Variables de entorno | Gestor de secretos, **nunca** en el repositorio | Crítica. Sin `SESSION_SECRET` no hay sesiones. |
| Código | Repositorio Git | Alta. |

Los archivos de `./.mail` son de desarrollo: no se respaldan.

## Política recomendada

| Parámetro | Valor |
| --- | --- |
| Frecuencia | Diaria completa, a las 03:00 hora de Argentina |
| Retención | 7 diarias, 4 semanales, 12 mensuales |
| Ubicación | Fuera del servidor de aplicación, cifrado en reposo |
| RPO objetivo | 24 horas (menos si se activa archivado de WAL) |
| RTO objetivo | 2 horas |
| Prueba de restauración | **Mensual**, sobre una base descartable. Un backup sin probar no es un backup. |

## Respaldar

```bash
# Base completa, formato comprimido
docker exec -e PGPASSWORD="$PGPASSWORD" jc_influencers_db \
  pg_dump -U jc_owner -d jc_influencers -Fc \
  > "backup-jc-influencers-$(date +%Y%m%d-%H%M).dump"
```

```bash
# Sólo el esquema, útil para comparar contra las migraciones
docker exec -e PGPASSWORD="$PGPASSWORD" jc_influencers_db \
  pg_dump -U jc_owner -d jc_influencers --schema-only \
  > "esquema-$(date +%Y%m%d).sql"
```

```bash
# Archivos, cuando se usa el driver local
tar -czf "storage-$(date +%Y%m%d).tar.gz" storage/
```

Con S3, activar versionado de objetos y una regla de ciclo de vida en el bucket.

## Restaurar

```bash
# 1. Base limpia
docker exec -e PGPASSWORD="$PGPASSWORD" jc_influencers_db \
  psql -U jc_owner -d postgres -c "CREATE DATABASE jc_influencers_restore OWNER jc_owner;"
```

```bash
# 2. Restaurar el dump
docker exec -i -e PGPASSWORD="$PGPASSWORD" jc_influencers_db \
  pg_restore -U jc_owner -d jc_influencers_restore --no-owner --clean --if-exists \
  < backup-jc-influencers-AAAAMMDD-HHMM.dump
```

```bash
# 3. Recrear el rol de aplicación y sus permisos si es un servidor nuevo
docker exec -i -e PGPASSWORD="$PGPASSWORD" jc_influencers_db \
  psql -U jc_owner -d jc_influencers_restore < docker/postgres-init/01-roles.sql
```

```bash
# 4. Verificar que RLS quedó activo (no debe devolver ninguna tabla salvo _prisma_migrations)
docker exec -e PGPASSWORD="$PGPASSWORD" jc_influencers_db \
  psql -U jc_owner -d jc_influencers_restore \
  -c "SELECT tablename FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity;"
```

```bash
# 5. Verificar que la auditoría siguió inmutable
docker exec -e PGPASSWORD="$PGPASSWORD" jc_influencers_db \
  psql -U jc_owner -d jc_influencers_restore \
  -c "SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE table_name='audit_logs' AND grantee='jc_app';"
```

Debe listar `SELECT` e `INSERT`, y **no** `UPDATE`, `DELETE` ni `TRUNCATE`.

```bash
# 6. Apuntar la app a la base restaurada y comprobar que arranca
DATABASE_URL="postgresql://jc_app:...@localhost:55432/jc_influencers_restore?schema=public" npm start
```

## Después de restaurar, verificar a mano

1. Entrar con un usuario de agencia y con uno de cliente.
2. Que el cliente vea **sólo** sus campañas.
3. Que el conteo de influencers, candidaturas y snapshots coincida con el del origen.
4. Que la auditoría conserve los eventos previos al incidente.
5. Que una exportación de cliente siga sin traer presupuestos.

## Puntos que hay que decidir con la agencia

- Dónde vive el backup cifrado y quién tiene la llave.
- Si se activa archivado de WAL para bajar el RPO de 24 horas a minutos.
- Cuánto tiempo se conservan los datos de contacto de influencers que nunca se contrataron.
  Ver [privacidad](08-privacidad.md).
