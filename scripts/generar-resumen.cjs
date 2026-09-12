/**
 * Genera el resumen ejecutivo de la evaluacion.
 *
 * Version corta del entregable: endpoint, listado de pruebas, peticion,
 * respuesta y evidencia. Todo en una sola tabla por grupo.
 *
 * El documento extenso, con el plan completo y el analisis desarrollado,
 * se genera aparte con scripts/generar-entregable.cjs.
 *
 * Uso: node scripts/generar-resumen.cjs
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  PageBreak, PageOrientation, Header, Footer, PageNumber, convertInchesToTwip,
} = require('docx');

const LETTER = { width: 12240, height: 15840 };
const M = convertInchesToTwip(0.5);
const ANCHO = LETTER.height - M * 2;   // horizontal
const ANCHO_V = LETTER.width - M * 2;  // vertical

const AZUL = '1F5C8B';
const CAB = 'EDEBE6';
const SUAVE = 'F5F4F1';
const ROJO = '9B2C2C';
const AMBAR = '8A5A12';
const VERDE = '2F6B46';
const TENUE = '5C5A54';

const BASE = 'https://api.thecatapi.com/v1';

/* ------------------------------------------------------------------ */

const p = (txt, o = {}) => new Paragraph({
  spacing: { after: o.after ?? 120, line: 268 },
  children: [new TextRun({ text: txt, size: o.size ?? 21, bold: o.bold, color: o.color, italics: o.italics })],
});

const h1 = (txt) => new Paragraph({
  heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 160 },
  children: [new TextRun({ text: txt, size: 30, bold: true, color: AZUL })],
});

const h2 = (txt) => new Paragraph({
  heading: HeadingLevel.HEADING_2, spacing: { before: 260, after: 120 },
  children: [new TextRun({ text: txt, size: 24, bold: true })],
});

const cod = (txt) => new Paragraph({
  spacing: { after: 0, line: 224 },
  children: [new TextRun({ text: txt, font: 'Consolas', size: 14 })],
});

const espacio = (h = 120) => new Paragraph({ spacing: { after: h }, children: [] });
const salto = () => new Paragraph({ children: [new PageBreak()] });

const nota = (titulo, txt, color = AZUL) => new Paragraph({
  spacing: { before: 140, after: 180, line: 268 },
  indent: { left: 160 },
  border: { left: { style: BorderStyle.SINGLE, size: 18, color, space: 12 } },
  shading: { type: ShadingType.CLEAR, fill: SUAVE },
  children: [
    new TextRun({ text: `${titulo} `, size: 21, bold: true }),
    new TextRun({ text: txt, size: 21 }),
  ],
});

const BORDES = {
  top: { style: BorderStyle.SINGLE, size: 4, color: 'C9C6BE' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: 'C9C6BE' },
  left: { style: BorderStyle.SINGLE, size: 4, color: 'C9C6BE' },
  right: { style: BorderStyle.SINGLE, size: 4, color: 'C9C6BE' },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'DEDCD6' },
  insideVertical: { style: BorderStyle.SINGLE, size: 2, color: 'DEDCD6' },
};

const celda = (c, o = {}) => new TableCell({
  width: { size: o.ancho, type: WidthType.DXA },
  shading: o.fondo ? { type: ShadingType.CLEAR, fill: o.fondo } : undefined,
  margins: { top: 60, bottom: 60, left: 95, right: 95 },
  verticalAlign: 'top',
  children: (Array.isArray(c) ? c : [c]).map((x) => x instanceof Paragraph ? x : new Paragraph({
    spacing: { after: 0, line: 238 },
    children: [new TextRun({ text: String(x), size: o.size ?? 15, bold: o.bold, color: o.color, font: o.font })],
  })),
});

const ajustar = (anchos, total) => {
  const MIN = 480;
  const base = anchos.map((a) => Math.max(a, MIN));
  const s = base.reduce((x, y) => x + y, 0);
  const e = base.map((a) => Math.max(MIN, Math.round((a / s) * total)));
  e[e.length - 1] += total - e.reduce((x, y) => x + y, 0);
  return e;
};

const tabla = (cab, filas, anchosProp, total = ANCHO, size = 15) => {
  const anchos = ajustar(anchosProp, total);
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: anchos,
    borders: BORDES,
    rows: [
      new TableRow({
        tableHeader: true,
        children: cab.map((x, i) => celda(x, { ancho: anchos[i], fondo: CAB, bold: true, size: Math.max(14, size - 1) })),
      }),
      ...filas.map((f) => new TableRow({ children: f.map((c, i) => celda(c, { ancho: anchos[i], size })) })),
    ],
  });
};

const ficha = (pares, anchoEtq = 2200, total = ANCHO_V) => {
  const a = ajustar([anchoEtq, total - anchoEtq], total);
  return new Table({
    width: { size: total, type: WidthType.DXA }, columnWidths: a, borders: BORDES,
    rows: pares.map(([k, v]) => new TableRow({
      children: [celda(k, { ancho: a[0], fondo: CAB, bold: true, size: 17 }), celda(v, { ancho: a[1], size: 18 })],
    })),
  });
};

/* ------------------------------------------------------------------ */

const raiz = path.join(__dirname, '..');
const CASOS = JSON.parse(fs.readFileSync(path.join(raiz, 'docs/datos/catalogo.json'), 'utf8')).casos;
const EV = JSON.parse(fs.readFileSync(path.join(raiz, 'docs/datos/evidencias.json'), 'utf8')).casos;
const HALL = JSON.parse(fs.readFileSync(path.join(raiz, 'docs/datos/hallazgos.json'), 'utf8')).hallazgos;

const url = (req) => String(req).replace(/^(GET|POST|PUT|DELETE|PATCH|HEAD) \//, `$1 ${BASE}/`);

/** Corta una linea larga en varias para que quepa en la celda. */
const partir = (txt, ancho = 58) => {
  const out = [];
  for (const linea of String(txt).split('\n')) {
    let resto = linea;
    while (resto.length > ancho) {
      let corte = resto.lastIndexOf('&', ancho);
      if (corte < ancho * 0.5) corte = resto.lastIndexOf(',', ancho);
      if (corte < ancho * 0.5) corte = resto.lastIndexOf(' ', ancho);
      if (corte < ancho * 0.5) corte = ancho;
      out.push(resto.slice(0, corte));
      resto = resto.slice(corte);
    }
    out.push(resto);
  }
  return out;
};

const estadoTxt = (c) => {
  const esp = String(c.statusEsperado ?? '');
  const real = String(c.statusReal ?? '');
  return `esperado ${esp}\nreal ${real}`;
};

const veredicto = (c) => {
  const txt = String(c.resultadoReal ?? '');
  const m = txt.match(/Hallazgo (H-\d+)/i);
  if (m) return { etiqueta: `Desviacion\n${m[1]}`, color: AMBAR };
  return { etiqueta: 'Correcto', color: VERDE };
};

/** Construye la fila de un caso: prueba, peticion, esperado, estado, evidencia. */
const fila = (c) => {
  const regs = EV[c.id] ?? [];

  const peticiones = regs.length
    ? regs.flatMap((r) => partir(url(r.req), 40).map(cod))
    : [cod('sin peticion registrada')];

  const evidencia = [];
  for (const r of regs) {
    evidencia.push(...partir(`${r.st}${r.ms !== undefined ? `  ${r.ms} ms` : ''}${r.n !== undefined && r.n !== null ? `  ${r.n} elem` : ''}`, 48).map(cod));
    if (r.hdr) {
      const claves = Object.entries(r.hdr).filter(([k]) => /pagination|encoding|allow/.test(k));
      for (const [k, v] of claves) evidencia.push(...partir(`${k}: ${v}`, 48).map(cod));
    }
    if (r.body) evidencia.push(...partir(String(r.body).slice(0, 230), 48).map(cod));
    if (r.medicion) evidencia.push(...partir(r.medicion, 48).map(cod));
    evidencia.push(cod(''));
  }
  if (evidencia.length === 0) evidencia.push(cod('sin evidencia'));

  const v = veredicto(c);

  return [
    c.id,
    c.objetivo,
    peticiones,
    c.esperado,
    estadoTxt(c).split('\n'),
    evidencia,
    [new Paragraph({ spacing: { after: 0 }, children: v.etiqueta.split('\n').map((l, i) => new TextRun({ text: (i ? ' ' : '') + l, size: 15, bold: true, color: v.color, break: i ? 1 : 0 })) })],
  ];
};

const CAB_TABLA = ['ID', 'Que prueba', 'Peticion', 'Resultado esperado', 'Status', 'Respuesta real', 'Veredicto'];
const ANCHOS = [700, 2100, 2900, 2400, 900, 3550, 1150];

const GRUPOS = [
  { t: 'Ejercicio 1 - Busqueda de imagenes: camino principal', pre: 'IMG-F' },
  { t: 'Ejercicio 1 - Busqueda de imagenes: entradas invalidas', pre: 'IMG-N' },
  { t: 'Ejercicio 1 - Busqueda de imagenes: valores limite', pre: 'IMG-B' },
  { t: 'Ejercicio 1 - Parametros que declara la especificacion', pre: 'ESP' },
  { t: 'Ejercicio 2 - Busqueda de razas: camino principal', pre: 'BRD-F' },
  { t: 'Ejercicio 2 - Busqueda de razas: entradas invalidas y limites', pre: 'BRD-N' },
  { t: 'Forma de la respuesta', pre: 'CTR' },
  { t: 'Seguridad', pre: 'SEG' },
  { t: 'Tiempos y disponibilidad', pre: 'NFN' },
];

/* ------------------------------------------------------------------ */

const conDesviacion = CASOS.filter((c) => /Hallazgo H-\d+/i.test(c.resultadoReal ?? '')).length;
const totalPeticiones = Object.values(EV).reduce((t, r) => t + r.length, 0);

const portada = [
  espacio(1600),
  new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: 'RESUMEN DE LA EVALUACION', size: 19, bold: true, color: AZUL })] }),
  new Paragraph({ spacing: { after: 130 }, children: [new TextRun({ text: 'Pruebas de los endpoints de busqueda', size: 38, bold: true })] }),
  new Paragraph({
    spacing: { after: 400 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: AZUL, space: 8 } },
    children: [new TextRun({ text: 'Endpoint, listado de pruebas, peticion, respuesta y evidencia', size: 22, color: TENUE })],
  }),

  h2('Endpoints probados'),
  ficha([
    ['URL base', BASE],
    ['Ejercicio 1', 'GET https://api.thecatapi.com/v1/images/search'],
    ['Ejercicio 2', 'GET https://api.thecatapi.com/v1/breeds/search'],
    ['Autenticacion', 'Encabezado x-api-key. El buscador de razas la exige: sin ella responde 403'],
    ['Entorno', 'Produccion. No existe entorno de pruebas'],
    ['Especificacion', 'https://developers.thecatapi.com/view-account/ylX4blBYT9FaoVd6OhvR?report=FJkYOq9tW'],
  ], 2200),

  espacio(240),

  h2('Cifras'),
  tabla(
    ['Pruebas', 'Correctas', 'Con desviacion', 'Peticiones ejecutadas', 'Hallazgos', 'Tiempo mediano'],
    [[String(CASOS.length), String(CASOS.length - conDesviacion), String(conDesviacion), String(totalPeticiones), String(HALL.length), '204 ms']],
    [1600, 1600, 1800, 2400, 1400, 1800], ANCHO_V, 18
  ),

  espacio(240),

  p('Fecha: ' + new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) +
    '. Repositorio: https://github.com/lrbg/TESTAPI. Portal: https://lrbg.github.io/TESTAPI/', { color: TENUE }),

  salto(),
];

const resumen = [
  h1('Que se encontro'),

  h2('Los parametros del ejercicio 1'),

  p('De los siete parametros que lista el enunciado, cuatro funcionan y tres no hacen nada. Los tres que no hacen nada tampoco aparecen en la especificacion del proveedor.'),

  tabla(
    ['Parametro', 'Funciona', 'Que pasa'],
    [
      ['limit', 'Si', 'Valida de 1 a 100. Sin llave entrega 10 como maximo'],
      ['page', 'Si', 'Pagina sin repetir imagenes. Rechaza negativos'],
      ['order', 'Si', 'Acepta ASC, DESC y RANDOM. Rechaza lo demas'],
      ['has_breeds', 'Si', 'Devuelve solo imagenes con raza'],
      ['size', 'No', 'Acepta cualquier valor y lo ignora'],
      ['mime_types', 'No', 'Se pide png y llegan gif y jpg'],
      ['format', 'No', 'Los tres valores devuelven el mismo JSON'],
      ['breed_ids', 'Si', 'Lo declara la especificacion, el enunciado no. Es el unico filtro que funciona'],
      ['category_ids', 'No', 'Lo declara la especificacion, el enunciado no. No devuelve categorias'],
      ['sub_id', 'No', 'Lo declara la especificacion, el enunciado no. No filtra'],
    ],
    [2000, 1200, ANCHO_V - 3200], ANCHO_V, 18
  ),

  espacio(200),

  h2('Los encabezados de paginacion'),

  p('El enunciado dice que "pueden" llegar. La condicion real es: con llave y con orden fijo.'),

  tabla(
    ['Consulta', 'Encabezados'],
    [
      ['?order=ASC&limit=3', 'Pagination-Count 13492, Page 0, Limit 3'],
      ['?order=DESC&limit=5&page=0', 'Pagination-Count 13492, Page 0, Limit 5'],
      ['?order=RANDOM&limit=5', 'ninguno'],
      ['Sin llave, cualquier consulta', 'ninguno'],
    ],
    [3600, ANCHO_V - 3600], ANCHO_V, 18
  ),

  espacio(200),

  h2('Hallazgos'),

  tabla(
    ['Clave', 'Sev.', 'Que pasa', 'Caso'],
    HALL.map((h) => [h.clave, h.severidad, `${h.titulo}. ${h.impacto}`, h.caso]),
    [700, 900, ANCHO_V - 3000, 1400], ANCHO_V, 17
  ),

  espacio(200),

  nota('Lo mas importante.', 'El enunciado y la especificacion del proveedor no listan los mismos parametros. Siguiendo solo el enunciado se prueban funciones que no existen y se deja sin probar breed_ids, el unico filtro que si funciona. Antes de cerrar el alcance hay que acordar cual de las dos fuentes manda.', ROJO),

  salto(),
];

const listado = [
  h1('Listado de pruebas'),

  p(`Las ${CASOS.length} pruebas con su peticion, su resultado esperado, el codigo de estado que se esperaba, el que devolvio el servicio y la respuesta real.`),

  tabla(
    ['Columna', 'Contenido'],
    [
      ['ID', 'Identificador. El mismo que usa el codigo y el reporte de ejecucion'],
      ['Que prueba', 'Que se quiere comprobar'],
      ['Peticion', 'La URL exacta que se envio'],
      ['Resultado esperado', 'Lo que deberia devolver'],
      ['Status', 'Codigo esperado y codigo real'],
      ['Respuesta real', 'Codigo, tiempo, cuantos elementos, encabezados y cuerpo'],
      ['Veredicto', 'Correcto, o la clave del hallazgo que documenta la diferencia'],
    ],
    [2200, ANCHO - 2200], ANCHO, 16
  ),

  ...GRUPOS.flatMap((g) => {
    const casos = CASOS.filter((c) => c.id.startsWith(g.pre));
    if (!casos.length) return [];
    return [salto(), h2(g.t), tabla(CAB_TABLA, casos.map(fila), ANCHOS, ANCHO, 15)];
  }),
];

/* ------------------------------------------------------------------ */

const encabezado = new Header({
  children: [new Paragraph({
    alignment: AlignmentType.RIGHT, spacing: { after: 50 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'DEDCD6', space: 5 } },
    children: [new TextRun({ text: 'Resumen de la evaluacion. api.thecatapi.com/v1', size: 14, color: TENUE })],
  })],
});

const pie = new Footer({
  children: [new Paragraph({
    alignment: AlignmentType.RIGHT,
    children: [
      new TextRun({ text: 'Pagina ', size: 14, color: TENUE }),
      new TextRun({ children: [PageNumber.CURRENT], size: 14, color: TENUE }),
      new TextRun({ text: ' de ', size: 14, color: TENUE }),
      new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 14, color: TENUE }),
    ],
  })],
});

const vert = { page: { size: { width: LETTER.width, height: LETTER.height }, margin: { top: M, bottom: M, left: M, right: M } } };
const horiz = { page: { size: { width: LETTER.width, height: LETTER.height, orientation: PageOrientation.LANDSCAPE }, margin: { top: M, bottom: M, left: M, right: M } } };

const doc = new Document({
  creator: 'lrbg',
  title: 'Resumen de la evaluacion: endpoints de busqueda de imagenes y razas',
  description: 'Endpoint, listado de pruebas, peticion, respuesta y evidencia',
  styles: { default: { document: { run: { font: 'Calibri', size: 21 } } } },
  sections: [
    { properties: vert, headers: { default: encabezado }, footers: { default: pie }, children: [...portada, ...resumen] },
    { properties: horiz, headers: { default: encabezado }, footers: { default: pie }, children: listado },
  ],
});

const salida = path.join(raiz, 'entregables', 'Resumen-QA-API.docx');
fs.mkdirSync(path.dirname(salida), { recursive: true });
Packer.toBuffer(doc).then((b) => {
  fs.writeFileSync(salida, b);
  console.log(`Resumen generado: ${salida}`);
  console.log(`${CASOS.length} pruebas, ${CASOS.length - conDesviacion} correctas, ${conDesviacion} con desviacion.`);
});
