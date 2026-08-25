import { describe, expect, it } from 'vitest'
import {
  looksLikeMultiplePeople,
  looksLikeSectionHeading,
  nameSimilarity,
  normalizeHandle,
  parseClientApproval,
  parseEngagementRate,
  parseFollowers,
  parseProfileUrl,
  parseStars,
  parseTierLabel,
  splitMetricLines,
  tierForFollowers,
} from '@/lib/domain/normalize'
import { escapeCsvCell, toCsv } from '@/lib/export/csv'
import { passwordProblems, hashPassword, verifyPassword } from '@/lib/auth/password'

describe('parseFollowers', () => {
  it('normaliza los formatos reales del Excel', () => {
    expect(parseFollowers('78,9k')).toMatchObject({ kind: 'value', value: 78_900 })
    expect(parseFollowers('10 k')).toMatchObject({ kind: 'value', value: 10_000 })
    expect(parseFollowers('7,2M')).toMatchObject({ kind: 'value', value: 7_200_000 })
    expect(parseFollowers('31.6K')).toMatchObject({ kind: 'value', value: 31_600 })
    expect(parseFollowers('176.000')).toMatchObject({ kind: 'value', value: 176_000 })
    expect(parseFollowers('42,327')).toMatchObject({ kind: 'value', value: 42_327 })
    expect(parseFollowers('Instagram: 152.000')).toMatchObject({ kind: 'value', value: 152_000 })
    expect(parseFollowers('980')).toMatchObject({ kind: 'value', value: 980 })
  })

  it('conserva el texto original', () => {
    const result = parseFollowers('78,9k')
    expect(result.raw).toBe('78,9k')
  })

  it('marca como ausente lo que el origen no traía', () => {
    for (const value of ['A verificar', '—', '', 'lo tiene oculto', 'A solicitar']) {
      expect(parseFollowers(value).kind).toBe('absent')
    }
  })

  it('no inventa un número cuando el separador es ambiguo', () => {
    // "83.4" podría ser 83.400 u 83,4 mil. El importador lo marca para revisión.
    const result = parseFollowers('83.4')
    expect(result.kind).toBe('unparseable')
  })
})

describe('parseEngagementRate', () => {
  it('lee porcentajes con coma o punto', () => {
    expect(parseEngagementRate('1.5%')).toMatchObject({ kind: 'value', value: { rate: 1.5 } })
    expect(parseEngagementRate('0,9%')).toMatchObject({ kind: 'value', value: { rate: 0.9 } })
  })

  it('detecta la plataforma cuando la celda la menciona', () => {
    const result = parseEngagementRate('3.1% TT')
    expect(result).toMatchObject({ kind: 'value', value: { rate: 3.1, platformHint: 'TIKTOK' } })
  })

  it('rechaza un número de seguidores pegado en la columna de ER', () => {
    // En el Excel real, "Instagram: 3.500" está en la columna de ER.
    expect(parseEngagementRate('Instagram: 3.500').kind).toBe('unparseable')
  })

  it('trata los valores ocultos como ausentes', () => {
    expect(parseEngagementRate('Likes ocultos').kind).toBe('absent')
    expect(parseEngagementRate('lo tiene oculto').kind).toBe('absent')
  })
})

describe('splitMetricLines', () => {
  it('separa celdas con varias métricas', () => {
    const lines = splitMetricLines('Instagram: 165.000\nTikTok: 50.000')
    expect(lines).toHaveLength(2)
    expect(lines[0]?.platform).toBe('INSTAGRAM')
    expect(lines[1]?.platform).toBe('TIKTOK')
  })
})

describe('parseProfileUrl', () => {
  it('detecta plataforma y handle, y limpia el tracking', () => {
    const result = parseProfileUrl('https://www.instagram.com/ivopirrone.ok?igsi=aHZzM3p0NWV0aHpj')
    expect(result.kind).toBe('value')
    if (result.kind !== 'value') return
    expect(result.value.platform).toBe('INSTAGRAM')
    expect(result.value.handle).toBe('ivopirrone.ok')
    expect(result.value.urlNormalized).toBe('instagram.com/ivopirrone.ok')
  })

  it('normaliza http/https, www y barra final al mismo valor', () => {
    const a = parseProfileUrl('http://instagram.com/petocolombo/')
    const b = parseProfileUrl('https://www.instagram.com/petocolombo')
    if (a.kind !== 'value' || b.kind !== 'value') throw new Error('esperaba valores')
    expect(a.value.urlNormalized).toBe(b.value.urlNormalized)
  })

  it('reconoce tiktok, youtube y linktree', () => {
    expect(parseProfileUrl('https://www.tiktok.com/@ahorrandoconcami')).toMatchObject({
      kind: 'value',
      value: { platform: 'TIKTOK', handle: 'ahorrandoconcami' },
    })
    expect(parseProfileUrl('https://www.youtube.com/@Sarraf_arg')).toMatchObject({
      kind: 'value',
      value: { platform: 'YOUTUBE' },
    })
    expect(parseProfileUrl('https://linktr.ee/santiamat')).toMatchObject({
      kind: 'value',
      value: { platform: 'LINKTREE' },
    })
  })

  it('rechaza protocolos que no son http o https', () => {
    expect(parseProfileUrl('javascript:alert(1)').kind).toBe('unparseable')
  })
})

describe('detección de filas que no son personas', () => {
  it('reconoce títulos de bloque', () => {
    expect(looksLikeSectionHeading('FEBRERO')).toBe(true)
    expect(looksLikeSectionHeading('SCREENING')).toBe(true)
    expect(looksLikeSectionHeading('Ivo Pirrone')).toBe(false)
  })

  it('reconoce filas con más de una persona', () => {
    expect(looksLikeMultiplePeople('Pamela Falbo + Sofia Priore')).toBe(true)
    expect(looksLikeMultiplePeople('Sofía y Belén Gueler')).toBe(true)
    expect(looksLikeMultiplePeople('Axel Becker')).toBe(false)
  })
})

describe('utilidades varias', () => {
  it('cuenta estrellas de fit', () => {
    expect(parseStars('⭐⭐⭐⭐⭐')).toBe(5)
    expect(parseStars('⭐⭐⭐')).toBe(3)
    expect(parseStars('')).toBeNull()
  })

  it('traduce la lista desplegable de aprobación del Excel', () => {
    expect(parseClientApproval('🟢APROBADO')).toBe('APPROVED')
    expect(parseClientApproval('🔴DESCARTADO')).toBe('REJECTED')
    expect(parseClientApproval('🟡A REVISAR')).toBe('NEEDS_REVIEW')
    expect(parseClientApproval('')).toBe('PENDING')
  })

  it('calcula el tier de audiencia', () => {
    expect(tierForFollowers(5_000)).toBe('NANO')
    expect(tierForFollowers(31_600)).toBe('MICRO')
    expect(tierForFollowers(250_000)).toBe('MACRO')
    expect(tierForFollowers(700_000)).toBe('FAMA')
    expect(tierForFollowers(7_200_000)).toBe('MEGA')
    expect(parseTierLabel('Micro (10k - 100k)')).toBe('MICRO')
  })

  it('normaliza handles', () => {
    expect(normalizeHandle('@IvoPirrone.OK')).toBe('ivopirrone.ok')
    expect(normalizeHandle('A verificar')).toBeNull()
    expect(normalizeHandle('con espacios')).toBeNull()
  })

  it('mide similitud de nombres', () => {
    expect(nameSimilarity('Markito Navaja', 'Markitos Navaja')).toBeGreaterThan(0.85)
    expect(nameSimilarity('Nicolás Abril', 'Nicolas Abril')).toBe(1)
    expect(nameSimilarity('Ivo Pirrone', 'Sabrina Castelli')).toBeLessThan(0.4)
  })
})

describe('CSV', () => {
  it('neutraliza fórmulas para que Excel no las ejecute', () => {
    expect(escapeCsvCell('=1+1')).toBe("'=1+1")
    expect(escapeCsvCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(escapeCsvCell('+34 911')).toBe("'+34 911")
  })

  it('escapa comillas y separadores', () => {
    expect(escapeCsvCell('Maca "La Biyuya"')).toBe('"Maca ""La Biyuya"""')
  })

  it('arma filas con encabezado', () => {
    const csv = toCsv([{ a: 1 }], [{ header: 'A', value: (row) => row.a }])
    expect(csv).toContain('A')
    expect(csv).toContain('1')
  })
})

describe('contraseñas', () => {
  it('exige una política mínima', () => {
    expect(passwordProblems('corta')).not.toHaveLength(0)
    expect(passwordProblems('sinmayusculas123')).toContain('Debe incluir una mayúscula.')
    expect(passwordProblems('Prueba.Segura.2026')).toHaveLength(0)
  })

  it('verifica el hash y rechaza el resto', async () => {
    const hash = await hashPassword('Prueba.Segura.2026')
    expect(hash.startsWith('scrypt$')).toBe(true)
    await expect(verifyPassword('Prueba.Segura.2026', hash)).resolves.toBe(true)
    await expect(verifyPassword('otra', hash)).resolves.toBe(false)
    await expect(verifyPassword('x', null)).resolves.toBe(false)
    await expect(verifyPassword('x', 'basura')).resolves.toBe(false)
  })
})
