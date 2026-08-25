import ExcelJS from 'exceljs'

/**
 * Genera un .xlsx con las mismas rarezas que el Excel real de la agencia:
 * celdas combinadas, seguidores con formatos mezclados, un separador ambiguo,
 * dos filas con la misma URL y nombres distintos, una fila con dos personas,
 * títulos de bloque y un hipervínculo que contradice el texto visible.
 */
export async function buildTestWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()

  const scouting = workbook.addWorksheet('SCOUTING KAST')
  scouting.addRow(['#', 'CREADOR', 'PERFIL INSTAGRAM', 'SEGMENTO', 'FOLLOWERS', 'ER', 'ENTREGABLE / STORY - REEL', 'PRESUPUESTO', 'APROBACION / CLIENTE', 'FEEDBACK / CLIENTE'])
  scouting.addRow([1, 'Ana Ficticia', 'https://www.instagram.com/ana.ficticia?igsi=ABC123', 'Finanzas', '78,9k', '1.5%', '2 stories', '', '🟢APROBADO', ''])
  scouting.addRow([2, 'Beto Inventado', 'https://www.instagram.com/beto.inventado', 'Viajes', '10 k', '3,1%', '', '', '🟡A REVISAR', 'demasiado nicho?'])
  scouting.addRow([3, 'Caro Prueba', 'https://www.instagram.com/caro.prueba', '', '7,2M', '', '', '', '🔴DESCARTADO', ''])
  // Mismo perfil que Ana pero con otro nombre: duplicado real, no se fusiona solo.
  scouting.addRow([4, 'Ana F.', 'https://www.instagram.com/ana.ficticia', '', '80k', '', '', '', '', ''])
  // Separador ambiguo: no se puede normalizar sin inventar.
  scouting.addRow([5, 'Dani Ambiguo', 'https://www.instagram.com/dani.ambiguo', '', '83.4', '', '', '', '', ''])
  // Dos personas en una fila.
  scouting.addRow([6, 'Eli Uno + Fer Dos', 'https://www.instagram.com/eli.y.fer', '', '5k', '', '', '', '', ''])
  scouting.addRow([])
  scouting.addRow(['', 'Presupuesto estimado'])
  scouting.addRow(['', 'Cache', '10.000USD'])
  scouting.addRow(['', 'Canje', 'N/A'])

  const anteriores = workbook.addWorksheet('SCOUTING Anteriores de kast')
  anteriores.addRow(['Gus Antiguo', '', 'https://www.instagram.com/gus.antiguo/'])
  const conflictRow = anteriores.addRow(['Hugo Conflicto', 'https://www.instagram.com/hugo.conflicto/'])
  // El texto dice un perfil y el link apunta a otro: contradicción del origen.
  conflictRow.getCell(2).value = {
    text: 'https://www.instagram.com/hugo.conflicto/',
    hyperlink: 'https://www.instagram.com/otro.distinto/',
  }
  anteriores.addRow(['FEBRERO'])
  anteriores.addRow(['Argentina', 'Ivo Historico', 'Instagram'])
  anteriores.addRow(['FINALIZADOS / RECHAZADOS / NO DISPONIBLES'])
  anteriores.addRow(['Argentina', 'Jorge Cerrado', 'Instagram'])

  const backlog = workbook.addWorksheet('Perfiles para agregar si aplica')
  backlog.addRow(['Karen Backlog'])
  backlog.addRow(['Luis Backlog'])
  backlog.addRow([''])
  backlog.addRow([''])
  // Celda combinada: ExcelJS repite el valor del maestro en cada fila del rango.
  backlog.getCell('A3').value = 'Mora Combinada'
  backlog.mergeCells('A3:A4')

  const brief = workbook.addWorksheet('Brief 2')
  brief.addRow([''])
  brief.addRow(['', 'País: Argentina'])
  brief.addRow(['', 'Followers: 10K–50K'])
  brief.addRow(['', 'Plataformas: Instagram + TikTok'])
  brief.addRow(['', 'ER: ideal >3%'])
  brief.addRow(['', 'Idioma: español'])
  brief.addRow(['', 'Edad audiencia: 25–45 aprox.'])
  brief.addRow([''])
  brief.addRow(['', '35% Crypto / Web3'])
  brief.addRow(['', '25% Fintech / Finanzas'])
  brief.addRow(['', '20% Viajes'])
  brief.addRow(['', '15% Freelancers / Remote Work'])
  brief.addRow(['', '5% Tech / Lifestyle'])

  const resumen = workbook.addWorksheet('RESUMEN')
  resumen.addRow([''])
  resumen.addRow(['', '🥇 1. @ana.ficticia'])
  resumen.addRow(['', '2. @beto.inventado'])
  // Segunda distribución del squad, distinta a la del brief: junto con la otra
  // sumarían 200%, así que no debe convertirse en clusters activos.
  resumen.addRow([''])
  resumen.addRow(['', '40% Crypto / Fintech'])
  resumen.addRow(['', '35% Travel'])
  resumen.addRow(['', '25% Remote / Business'])

  const vacia = workbook.addWorksheet('vista funnel')
  vacia.getCell('A1').value = null

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
