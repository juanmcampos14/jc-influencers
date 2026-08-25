# Certificados

## `supabase-root-2021.crt`

CA raíz de Supabase. El pooler de conexiones (`*.pooler.supabase.com`) presenta un certificado
firmado por esta CA privada, que **no** está entre las de confianza del sistema.

Sin ella, la única alternativa es `rejectUnauthorized: false`, que acepta cualquier certificado y deja
la conexión a la base abierta a un ataque de intermediario. Fijar la CA obliga a que el certificado
venga de Supabase.

| Dato | Valor |
| --- | --- |
| CN | Supabase Root 2021 CA |
| Huella SHA-256 | `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA` |
| Vigencia | 28/04/2021 → 26/04/2031 |

**No es un secreto**: es un certificado público y por eso está versionado.

### Verificar la huella

Conviene confirmarla una vez contra la que publica Supabase, en el panel del proyecto:
*Project Settings → Database → SSL Configuration → Download certificate*.

```bash
openssl x509 -in certs/supabase-root-2021.crt -noout -fingerprint -sha256 -subject -dates
```

### Cuando Supabase rote la CA

Reemplazar el archivo, o pasar la nueva por la variable `DATABASE_CA_CERT` sin necesidad de
desplegar. Si la CA no valida, la aplicación **falla al conectar**: es a propósito, es preferible a
conectarse sin verificar.
