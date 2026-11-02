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
export async function buildGenericWorkbook(): Promise<Buffer> {
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
    'PAÍS',
    'COMENTARIOS',
  ])

  const uno = hoja.addRow([
    'Lucía Ficticia',
    'https://www.instagram.com/lucia.ficticia/?hl=es',
    'INSTAGRAM',
    'LIFESTYLE',
    960000,
    0.14,
    51415,
    '+34 612 345 678',
    'lucia@ejemplo.test',
    'ESPAÑA',
    'Trabajó con la marca en 2024',
  ])
  uno.getCell(6).numFmt = '0%'
  uno.getCell(7).numFmt = '[$USD] #,##0.00'

  // El ER como texto, que es lo que pasa cuando alguien lo escribe a mano.
  const dos = hoja.addRow([
    'Mateo Inventado',
    'https://www.instagram.com/mateo.inventado/',
    'INSTAGRAM',
    'GAMING',
    428000,
    '4,5%',
    29380,
    '612345678',
    '',
    'ESPAÑA',
    '',
  ])
  dos.getCell(7).numFmt = '[$EUR] #,##0.00'

  // Celda con hipervínculo y texto que no es la URL.
  const tres = hoja.addRow(['Sofía Prueba', 'Instagram', 'INSTAGRAM', 'MODA', 150000, 0.032, null, '', '', 'ESPAÑA', ''])
  tres.getCell(2).value = { text: 'Instagram', hyperlink: 'https://www.instagram.com/sofia.prueba/' }
  tres.getCell(6).numFmt = '0.0%'

  // Dos personas en una fila: se reporta, no se parte.
  hoja.addRow(['Ana Uno + Beto Dos', 'https://www.instagram.com/ana.y.beto/', 'INSTAGRAM', '', 5000, null, null, '', '', '', ''])

  // Sin URL: entra al padrón igual, y se dice que entró sin perfil.
  hoja.addRow(['Nico SinLink', '', 'INSTAGRAM', 'DEPORTES', 90000, null, null, '', '', 'ESPAÑA', ''])

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
