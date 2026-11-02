import ExcelJS from 'exceljs'

/**
 * Una planilla AJENA, con la forma del Excel de España que no se podía importar.
 *
 * Las cuatro rarezas que importan y que ningún lector por nombre de hoja
 * cubría:
 *
 *  - la hoja se llama cualquier cosa ("INTERNACIONALES");
 *  - el encabezado está en la fila 4, no en la 1;
 *  - el ER es un porcentaje de Excel: la celda vale 0,14 y se ve "14%";
 *  - el precio trae la moneda en el FORMATO de la celda, no en el texto.
 *
 * Suma además una columna de teléfono y una de email, que la de España no
 * tiene pero otras bases sí.
 */
export async function buildGenericWorkbook(
  opciones: {
    conPais?: boolean
    /**
     * La red de los perfiles. Twitch sirve para un caso que Instagram no
     * puede fijar: NINGÚN proveedor conectado sabe actualizar un perfil de
     * Twitch, así que el test no depende de qué credenciales haya cargadas.
     */
    red?: 'instagram' | 'twitch'
  } = {},
): Promise<Buffer> {
  const conPais = opciones.conPais !== false
  const red = opciones.red ?? 'instagram'
  const plataforma = red === 'twitch' ? 'TWITCH' : 'INSTAGRAM'
  const perfil = (usuario: string, extra = '') =>
    red === 'twitch' ? `https://www.twitch.tv/${usuario}` : `https://www.instagram.com/${usuario}/${extra}`
  const workbook = new ExcelJS.Workbook()
  const hoja = workbook.addWorksheet('INTERNACIONALES')

  hoja.addRow(['BASE DE INFLUENCERS'])
  hoja.addRow([])
  hoja.addRow(['Actualizado marzo'])
  hoja.addRow([
    'INFLUENCER NOMBRE',
    'INFLUENCER (con URL)',
    'PLATAFORMA',
    'VERTICAL',
    'FOLLOWERS',
    'AV. ER',
    'PRECIO (Sin IVA)',
    'TELÉFONO',
    'EMAIL',
    ...(conPais ? ['PAÍS'] : []),
    'COMENTARIOS',
  ])

  const uno = hoja.addRow([
    'Lucía Ficticia',
    perfil('lucia.ficticia', '?hl=es'),
    plataforma,
    'LIFESTYLE',
    960000,
    0.14,
    51415,
    '+34 612 345 678',
    'lucia@ejemplo.test',
    ...(conPais ? ['ESPAÑA'] : []),
    'Trabajó con la marca en 2024',
  ])
  uno.getCell(6).numFmt = '0%'
  uno.getCell(7).numFmt = '[$USD] #,##0.00'

  // El ER como texto, que es lo que pasa cuando alguien lo escribe a mano.
  const dos = hoja.addRow([
    'Mateo Inventado',
    perfil('mateo.inventado'),
    plataforma,
    'GAMING',
    428000,
    '4,5%',
    29380,
    '612345678',
    '',
    ...(conPais ? ['ESPAÑA'] : []),
    '',
  ])
  dos.getCell(7).numFmt = '[$EUR] #,##0.00'

  // Celda con hipervínculo y texto que no es la URL.
  const tres = hoja.addRow([
    'Sofía Prueba', 'Instagram', plataforma, 'MODA', 150000, 0.032, null, '', '',
    ...(conPais ? ['ESPAÑA'] : []), '',
  ])
  tres.getCell(2).value = { text: 'Instagram', hyperlink: perfil('sofia.prueba') }
  tres.getCell(6).numFmt = '0.0%'

  // Dos personas en una fila: se reporta, no se parte.
  hoja.addRow([
    'Ana Uno + Beto Dos', perfil('ana.y.beto'), plataforma, '', 5000, null, null, '', '',
    ...(conPais ? [''] : []), '',
  ])

  // Sin URL: entra al padrón igual, y se dice que entró sin perfil.
  hoja.addRow([
    'Nico SinLink', '', plataforma, 'DEPORTES', 90000, null, null, '', '',
    ...(conPais ? ['ESPAÑA'] : []), '',
  ])

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
