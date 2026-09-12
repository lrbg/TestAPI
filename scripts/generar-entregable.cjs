/**
 * Genera el documento de entrega de la evaluacion tecnica.
 *
 * Reune los cinco entregables solicitados y anade un capitulo de evidencia con
 * la peticion y la respuesta reales de cada caso.
 *
 * Fuentes de datos:
 *   docs/datos/catalogo.json    casos de prueba
 *   docs/datos/evidencias.json  peticiones y respuestas capturadas
 *
 * Uso: node scripts/generar-entregable.cjs
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  PageBreak, PageOrientation, Header, Footer, PageNumber, convertInchesToTwip,
} = require('docx');

/* ------------------------------------------------------------------ */
/* Maquetacion                                                         */
/* ------------------------------------------------------------------ */

const LETTER = { width: 12240, height: 15840 };
const MARGEN = convertInchesToTwip(0.9);

const AZUL = '1F5C8B';
const GRIS_CABECERA = 'EDEBE6';
const GRIS_SUAVE = 'F5F4F1';
const GRIS_CODIGO = 'F0EFEC';
const ROJO = '9B2C2C';
const AMBAR = '8A5A12';
const VERDE = '2F6B46';
const TENUE = '5C5A54';

/* Las hojas horizontales usan un margen menor para ganar ancho de tabla. */
const MARGEN_H = convertInchesToTwip(0.5);

const ANCHO_V = LETTER.width - MARGEN * 2;
const ANCHO_H = LETTER.height - MARGEN_H * 2;

/* ------------------------------------------------------------------ */
/* Constructores                                                       */
/* ------------------------------------------------------------------ */

const p = (texto, o = {}) =>
  new Paragraph({
    spacing: { after: o.after ?? 130, line: 272 },
    alignment: o.alignment,
    children: [new TextRun({ text: texto, size: o.size ?? 21, bold: o.bold, italics: o.italics, color: o.color })],
  });

const pm = (frags, o = {}) =>
  new Paragraph({
    spacing: { after: o.after ?? 130, line: 272 },
    children: frags.map((f) => {
      const [t, e = {}] = Array.isArray(f) ? f : [f, {}];
      return new TextRun({ text: t, size: 21, ...e });
    }),
  });

const h1 = (t) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 340, after: 170 },
    children: [new TextRun({ text: t, size: 30, bold: true, color: AZUL })],
  });

const h2 = (t) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 290, after: 130 },
    children: [new TextRun({ text: t, size: 25, bold: true })],
  });

const h3 = (t) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 230, after: 110 },
    children: [new TextRun({ text: t, size: 22, bold: true, color: TENUE })],
  });

const vineta = (t) =>
  new Paragraph({
    numbering: { reference: 'vinetas', level: 0 },
    spacing: { after: 80, line: 272 },
    children: [new TextRun({ text: t, size: 21 })],
  });

const numerado = (t) =>
  new Paragraph({
    numbering: { reference: 'numeros', level: 0 },
    spacing: { after: 80, line: 272 },
    children: [new TextRun({ text: t, size: 21 })],
  });

const espacio = (h = 120) => new Paragraph({ spacing: { after: h }, children: [] });
const salto = () => new Paragraph({ children: [new PageBreak()] });

const nota = (titulo, texto, color = AZUL) =>
  new Paragraph({
    spacing: { before: 150, after: 190, line: 272 },
    indent: { left: 170 },
    border: { left: { style: BorderStyle.SINGLE, size: 18, color, space: 13 } },
    shading: { type: ShadingType.CLEAR, fill: GRIS_SUAVE },
    children: [
      new TextRun({ text: `${titulo} `, size: 21, bold: true }),
      new TextRun({ text: texto, size: 21 }),
    ],
  });

/** Parrafo de codigo: monoespaciado, pequeno, con fondo. */
const codigo = (texto) =>
  new Paragraph({
    spacing: { after: 0, line: 230 },
    children: [new TextRun({ text: texto, font: 'Consolas', size: 15 })],
  });

const celda = (contenido, o = {}) =>
  new TableCell({
    width: { size: o.ancho, type: WidthType.DXA },
    shading: o.fondo ? { type: ShadingType.CLEAR, fill: o.fondo } : undefined,
    margins: { top: 70, bottom: 70, left: 105, right: 105 },
    verticalAlign: 'top',
    children: (Array.isArray(contenido) ? contenido : [contenido]).map((x) =>
      x instanceof Paragraph
        ? x
        : new Paragraph({
            spacing: { after: 0, line: 246 },
            alignment: o.alignment,
            children: [
              new TextRun({ text: String(x), size: o.size ?? 18, bold: o.bold, color: o.color, font: o.font }),
            ],
          })
    ),
  });

const normalizarAnchos = (anchos, total) => {
  const MIN = 500;
  const base = anchos.map((a) => Math.max(Number(a) || 0, MIN));
  const suma = base.reduce((x, y) => x + y, 0);
  const esc = base.map((a) => Math.max(MIN, Math.round((a / suma) * total)));
  esc[esc.length - 1] += total - esc.reduce((x, y) => x + y, 0);
  return esc;
};

const BORDES = {
  top: { style: BorderStyle.SINGLE, size: 4, color: 'C9C6BE' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: 'C9C6BE' },
  left: { style: BorderStyle.SINGLE, size: 4, color: 'C9C6BE' },
  right: { style: BorderStyle.SINGLE, size: 4, color: 'C9C6BE' },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'DEDCD6' },
  insideVertical: { style: BorderStyle.SINGLE, size: 2, color: 'DEDCD6' },
};

const tabla = (encabezados, filas, anchosProp, total = ANCHO_V, tamano = 18) => {
  const anchos = normalizarAnchos(anchosProp, total);
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: anchos,
    borders: BORDES,
    rows: [
      new TableRow({
        tableHeader: true,
        children: encabezados.map((t, i) =>
          celda(t, { ancho: anchos[i], fondo: GRIS_CABECERA, bold: true, size: Math.max(15, tamano - 1) })
        ),
      }),
      ...filas.map((f) => new TableRow({ children: f.map((c, i) => celda(c, { ancho: anchos[i], size: tamano })) })),
    ],
  });
};

/** Tabla de dos columnas sin encabezado, para fichas. */
const ficha = (pares, anchoEtiqueta = 1900, total = ANCHO_V) => {
  const anchos = normalizarAnchos([anchoEtiqueta, total - anchoEtiqueta], total);
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: anchos,
    borders: BORDES,
    rows: pares.map(([etiqueta, valor, opciones = {}]) =>
      new TableRow({
        children: [
          celda(etiqueta, { ancho: anchos[0], fondo: GRIS_CABECERA, bold: true, size: 17 }),
          celda(valor, { ancho: anchos[1], size: opciones.size ?? 18, font: opciones.font, color: opciones.color }),
        ],
      })
    ),
  });
};

/* ------------------------------------------------------------------ */
/* Datos                                                               */
/* ------------------------------------------------------------------ */

const raiz = path.join(__dirname, '..');
const catalogo = JSON.parse(fs.readFileSync(path.join(raiz, 'docs/datos/catalogo.json'), 'utf8'));
const evidencias = JSON.parse(fs.readFileSync(path.join(raiz, 'docs/datos/evidencias.json'), 'utf8'));

const CASOS = catalogo.casos;
const BASE_API = 'https://api.thecatapi.com/v1';

/** Devuelve la peticion con su URL absoluta, para que el endpoint quede explicito. */
const urlCompleta = (req) =>
  String(req).replace(/^(GET|POST|PUT|DELETE|PATCH|HEAD) \//, `$1 ${BASE_API}/`);

const porTipo = (t) => CASOS.filter((c) => c.tipo === t).length;

/* ------------------------------------------------------------------ */
/* Portada e indice                                                    */
/* ------------------------------------------------------------------ */

const portada = [
  espacio(2200),
  new Paragraph({
    spacing: { after: 90 },
    children: [new TextRun({ text: 'EVALUACION TECNICA DE CALIDAD', size: 19, bold: true, color: AZUL })],
  }),
  new Paragraph({
    spacing: { after: 140 },
    children: [new TextRun({ text: 'Pruebas de los endpoints de busqueda de imagenes y razas', size: 38, bold: true })],
  }),
  new Paragraph({
    spacing: { after: 460 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: AZUL, space: 8 } },
    children: [new TextRun({ text: 'Analisis, plan, casos con evidencia, priorizacion y automatizacion', size: 23, color: TENUE })],
  }),
  ficha([
    ['Sistema probado', 'TheCatAPI version 1. GET /images/search y GET /breeds/search'],
    ['Tipo de prueba', 'Caja negra sobre el entorno de produccion'],
    ['Casos disenados', `${CASOS.length}`],
    ['Peticiones ejecutadas', 'Mas de 150 durante el relevamiento y la captura de evidencia'],
    ['Hallazgos', '12 desviaciones comprobadas. 5 de severidad alta'],
    ['Escenarios de carga', 'Humo, carga, estres, pico y resistencia'],
    ['Normas aplicadas', 'ISO/IEC 25010:2023; ISO/IEC/IEEE 29119-1, 2, 3 y 4; ISO/IEC 20000-1'],
    ['Repositorio', 'https://github.com/lrbg/TESTAPI'],
    ['Portal de resultados', 'https://lrbg.github.io/TESTAPI/'],
    ['Fecha', new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })],
  ], 2800),
  espacio(500),
  p('Cada afirmacion de este documento sobre el comportamiento del servicio esta respaldada por una peticion real. El capitulo 5 contiene la peticion, la respuesta y el resultado de cada caso.', { color: TENUE }),
  salto(),
];

/* ------------------------------------------------------------------ */
/* 1. Resumen                                                          */
/* ------------------------------------------------------------------ */

const resumen = [
  h1('1. Resumen'),

  h2('1.1 Que se pidio'),

  p('Validar la calidad de dos endpoints de TheCatAPI. El trabajo consiste en analizar la especificacion entregada, elaborar un plan de pruebas y ejecutarlo.'),

  tabla(
    ['Endpoint', 'Para que sirve', 'Parametros'],
    [
      ['GET https://api.thecatapi.com/v1/images/search', 'Buscar o devolver imagenes aleatorias', 'size, mime_types, format, has_breeds, order, page, limit'],
      ['GET https://api.thecatapi.com/v1/breeds/search', 'Buscar razas por nombre', 'q, attach_image'],
    ],
    [2500, 3000, ANCHO_V - 5500]
  ),

  espacio(180),

  h2('1.2 Que se encontro'),

  p('La especificacion describe los endpoints y lista sus parametros. No define nada mas. Esto es lo que falta:'),

  tabla(
    ['Falta', 'Consecuencia'],
    [
      ['Contrato de respuesta', 'No hay forma de saber que campos son obligatorios'],
      ['Valores validos de cada parametro', 'No se puede distinguir una entrada valida de una invalida'],
      ['Codigos de error', 'No hay resultado esperado para las pruebas negativas'],
      ['Metodo de autenticacion', 'El segundo ejercicio no se puede ejecutar tal como esta escrito'],
      ['Limites de consumo', 'No se puede dimensionar la prueba de carga'],
      ['Acuerdo de nivel de servicio', 'Los umbrales de tiempo son una estimacion'],
    ],
    [3300, ANCHO_V - 3300]
  ),

  espacio(160),

  nota(
    'Bloqueante.',
    'El endpoint de razas exige llave de API. Sin ella responde 403 a cualquier consulta. La especificacion no menciona la autenticacion en ningun punto. Este fue el primer resultado del relevamiento y obligo a disenar la suite con dos modos: anonimo y autenticado.',
    ROJO
  ),

  p('Se ejecutaron mas de 150 peticiones reales para reconstruir el comportamiento del servicio. Resultado: 10 puntos sin definir en la especificacion y 12 desviaciones comprobadas entre lo declarado y lo que el servicio hace.'),

  h3('Hallazgos de severidad alta'),

  tabla(
    ['Clave', 'Que ocurre', 'Impacto'],
    [
      ['H-01', 'attach_image no hace nada. Las respuestas con valor 0 y con valor 1 son identicas, incluido el mismo ETag.', 'Un cliente que use el parametro para reducir el tamano de la respuesta no obtiene ninguna reduccion.'],
      ['H-02', 'Sin llave, el servicio entrega 10 elementos aunque se pidan 50. No avisa del recorte. Con llave entrega los 50.', 'El cliente no distingue entre "no hay mas datos" y "tu plan no alcanza". Pierde datos sin senal alguna.'],
      ['H-03', 'mime_types no filtra. Al pedir png devuelve gif y jpg.', 'Un cliente que necesite un formato concreto recibe archivos que no puede procesar.'],
      ['H-09', 'El contrato cambia con la llave: 4 campos sin ella, hasta 10 con ella. Tambien cambia el dominio de las imagenes.', 'Una validacion de esquema falla de forma intermitente si no fija el modo de autenticacion.'],
      ['H-11', 'La llave se acepta en la URL como parametro api_key.', 'La credencial queda registrada en los accesos del servidor, en el historial del navegador y en los proxies intermedios.'],
    ],
    [800, 4400, ANCHO_V - 5200]
  ),

  espacio(180),

  h2('1.3 Que se entrega'),

  tabla(
    ['Entregable solicitado', 'Donde esta'],
    [
      ['Analisis del API', 'Capitulo 2'],
      ['Plan de pruebas', 'Capitulo 3'],
      ['Casos de prueba', `Capitulo 4: matriz de ${CASOS.length} casos`],
      ['Evidencia de cada caso', 'Capitulo 5: peticion, respuesta y resultado'],
      ['Priorizacion de pruebas', 'Capitulo 6'],
      ['Propuesta de automatizacion', 'Capitulo 7'],
      ['Suite ejecutable y flujo automatizado', 'Capitulo 8 y repositorio'],
    ],
    [3600, ANCHO_V - 3600]
  ),

  salto(),
];

/* ------------------------------------------------------------------ */
/* 2. Analisis                                                         */
/* ------------------------------------------------------------------ */

const hallazgo = (clave, severidad, titulo, dice, hace, evidencia, impacto, caso) => [
  h3(`${clave}. ${titulo}`),
  ficha([
    ['Severidad', severidad, { color: severidad === 'Alta' ? ROJO : severidad === 'Media' ? AMBAR : TENUE }],
    ['Que dice la especificacion', dice],
    ['Que hace el servicio', hace],
    ['Evidencia', evidencia, { font: 'Consolas', size: 15 }],
    ['Impacto', impacto],
    ['Caso que lo reproduce', caso, { font: 'Consolas' }],
  ], 2700),
  espacio(200),
];

const analisis = [
  h1('2. Analisis del API'),

  h2('2.1 Los dos endpoints'),

  p('La especificacion indica ademas dos comportamientos condicionales, ambos con el verbo "puede" y sin precisar la condicion:'),

  vineta('La busqueda de imagenes puede devolver los encabezados Pagination-Count, Pagination-Page y Pagination-Limit.'),
  vineta('La busqueda de razas puede devolver informacion de imagen cuando attach_image vale 1.'),

  p('Un condicional sin condicion no se puede verificar. Ambos puntos se resolvieron por observacion y figuran como hallazgos H-06 y H-01.'),

  h2('2.2 Como se hizo el analisis'),

  p('Se ejecutaron peticiones reales contra el servicio en produccion, en los dos modos de consumo: anonimo y con llave. Para cada parametro se probaron cinco variantes:'),

  numerado('Un valor tipico.'),
  numerado('Los valores frontera de su rango.'),
  numerado('Un valor fuera de rango.'),
  numerado('Un valor de tipo incorrecto.'),
  numerado('La omision del parametro.'),

  p('De cada respuesta se registro el codigo de estado, los encabezados, el cuerpo y el tiempo. El capitulo 5 contiene ese registro.'),

  nota(
    'Limite del relevamiento.',
    'El servicio es de un tercero y esta en produccion. No hay entorno de pruebas. Cada peticion consume cuota real. Por eso el volumen se mantuvo bajo y las pruebas de carga alta quedaron fuera del alcance automatico.'
  ),

  h2('2.3 Lo que la especificacion no dice'),

  p('Diez puntos que impiden decidir si un comportamiento es correcto. Cada uno necesita respuesta del equipo del servicio.'),

  tabla(
    ['Clave', 'Que falta', 'Por que importa'],
    [
      ['A-01', 'El metodo de autenticacion.', 'El endpoint de razas responde 403 sin llave. El ejercicio 2 no se puede ejecutar tal como esta escrito.'],
      ['A-02', 'Los valores validos de size, mime_types y format.', 'Sin la lista de valores validos no hay prueba negativa posible. El servicio los acepta todos, asi que tampoco se deducen por observacion.'],
      ['A-03', 'El rango de limit y de page.', 'Son el objeto de las pruebas de borde. Se dedujeron de los mensajes de error del servicio.'],
      ['A-04', 'Cuando aparecen los encabezados de paginacion.', 'Un cliente que los lea siempre obtendra valores nulos en la mayoria de las llamadas.'],
      ['A-05', 'Que hace exactamente attach_image.', 'El comportamiento observado contradice la lectura natural del enunciado.'],
      ['A-06', 'Que devolver cuando no hay coincidencias.', 'Coleccion vacia con 200 y error 404 son dos disenos validos y opuestos.'],
      ['A-07', 'El formato del cuerpo de error.', 'Sin contrato de error no se puede verificar que los fallos se comuniquen de forma util.'],
      ['A-08', 'La politica de limites de consumo.', 'Define el perfil maximo de la prueba de carga. Explica buena parte de los fallos intermitentes.'],
      ['A-09', 'La politica de versiones.', 'Sin ella no se distingue un cambio anunciado de una ruptura de contrato.'],
      ['A-10', 'El acuerdo de nivel de servicio.', 'Los umbrales de tiempo de este plan son una estimacion basada en una medicion propia.'],
    ],
    [800, 3200, ANCHO_V - 4000]
  ),

  salto(),

  h2('2.4 Reglas reales de cada parametro'),

  p('Ninguna de estas reglas figura en la especificacion. Se obtuvieron probando valores y leyendo los mensajes de error del servicio.'),

  tabla(
    ['Parametro', 'Rango real', 'Valida', 'Mensaje o comportamiento observado'],
    [
      ['limit', '1 a 100', 'Si', 'limit=0: "limit must not be less than 1". limit=101: "limit must not be greater than 100"'],
      ['page', 'Entero mayor o igual a 0', 'Si', 'page=-1: "page must not be less than 0"'],
      ['order', 'ASC, DESC o RANDOM', 'Si', 'order=SIDEWAYS: "order must be one of the following values: ASC, DESC, RANDOM"'],
      ['q', '1 a 30 caracteres', 'Si', 'q vacio: "q must be longer than or equal to 1 characters". q de 31: "q must be shorter than or equal to 30 characters"'],
      ['size', 'Sin declarar', 'No', 'size=gigantesco devuelve 200 con resultados'],
      ['mime_types', 'Sin declarar', 'No', 'mime_types=application/pdf devuelve 200 con una imagen jpg'],
      ['format', 'Sin declarar', 'No', 'format=xml devuelve 200 con la misma coleccion JSON'],
      ['has_breeds', 'Acepta 0, 1 y cadenas booleanas', 'Parcial', 'has_breeds=true devuelve 200'],
      ['attach_image', 'Acepta cualquier valor', 'No', 'attach_image=9 devuelve la misma respuesta que 0 y que 1'],
      ['Desconocidos', 'No aplica', 'No', 'Se ignoran sin aviso'],
    ],
    [1500, 1900, 900, ANCHO_V - 4300]
  ),

  espacio(160),

  nota(
    'Nota sobre la validacion.',
    'Cuatro parametros se validan de forma estricta y seis no se validan en absoluto. Un error de escritura en order se detecta al momento; el mismo error en size pasa inadvertido. Esta inconsistencia esta registrada como hallazgo H-04.',
    AMBAR
  ),

  salto(),

  h2('2.5 Los doce hallazgos'),

  p('Diferencias comprobadas entre lo que la especificacion declara y lo que el servicio hace.'),

  tabla(
    ['Clave', 'Severidad', 'Hallazgo', 'Caso'],
    [
      ['H-01', 'Alta', 'attach_image no tiene efecto.', 'BRD-N-06'],
      ['H-02', 'Alta', 'La coleccion se recorta a 10 sin llave y sin avisar.', 'IMG-B-03'],
      ['H-03', 'Alta', 'mime_types no filtra los resultados.', 'IMG-B-07'],
      ['H-09', 'Alta', 'El contrato de respuesta cambia con la llave.', 'CTR-03'],
      ['H-11', 'Alta', 'La llave se acepta en la cadena de consulta.', 'SEG-04'],
      ['H-04', 'Media', 'La validacion de parametros no es uniforme.', 'IMG-B-06'],
      ['H-05', 'Media', 'format no cambia la representacion devuelta.', 'IMG-B-10'],
      ['H-06', 'Media', 'Los encabezados de paginacion tienen una condicion no documentada.', 'IMG-B-11'],
      ['H-08', 'Media', 'Omitir q y enviarlo vacio dan respuestas opuestas.', 'BRD-F-10'],
      ['H-10', 'Media', 'El campo message cambia de tipo segun el codigo.', 'CTR-07'],
      ['H-12', 'Media', 'Hay direcciones de imagen con extension .false.', 'IMG-F-02'],
      ['H-07', 'Baja', 'Un verbo no soportado responde 404 en lugar de 405.', 'IMG-N-07'],
    ],
    [800, 1200, ANCHO_V - 3300, 1300]
  ),

  espacio(240),

  ...hallazgo(
    'H-01', 'Alta', 'attach_image no tiene efecto',
    'La informacion de imagen se devuelve cuando attach_image vale 1.',
    'Se devuelve siempre. Con valor 0, con valor 1 y con valor 9 la respuesta es identica, incluido el mismo ETag.',
    'attach_image=1  ->  200, ETag W/"371-b4hmnUL8+90ALgyxS8MOcno5V8Y", incluye image\nattach_image=0  ->  200, ETag W/"371-b4hmnUL8+90ALgyxS8MOcno5V8Y", incluye image',
    'Un cliente movil que use attach_image=0 para ahorrar ancho de banda no ahorra nada. No hay error, solo un coste que nadie ve.',
    'BRD-N-06'
  ),

  ...hallazgo(
    'H-02', 'Alta', 'La coleccion se recorta sin avisar',
    'El parametro limit acepta valores hasta 100, segun el propio mensaje de error del servicio.',
    'Sin llave, una peticion de 50 elementos devuelve 10. No hay encabezado que indique el recorte. La misma peticion con llave devuelve 50.',
    'Sin llave: GET /images/search?limit=50  ->  200, 10 elementos\nCon llave: GET /images/search?limit=50  ->  200, 50 elementos\nEn ninguno de los dos casos hay encabezado de truncamiento',
    'El cliente no puede distinguir "no hay mas datos" de "tu plan no alcanza". Una paginacion construida sobre esa respuesta se detiene antes de tiempo y pierde datos.',
    'IMG-B-03'
  ),

  ...hallazgo(
    'H-03', 'Alta', 'mime_types no filtra',
    'El endpoint acepta un parametro mime_types para filtrar por tipo de imagen.',
    'El filtro se acepta y no se aplica. Tampoco se valida: un tipo que no corresponde a una imagen tambien devuelve 200.',
    'GET /images/search?limit=10&mime_types=png\n  ->  200, direcciones devueltas: 21o.gif, 4K82ZeIgat.jpg, 91a.jpg, 94n.jpg, ...\nGET /images/search?mime_types=application/pdf\n  ->  200, devuelve 5ip.jpg',
    'Un cliente que necesite png por transparencia, o gif por animacion, recibe archivos que no puede usar.',
    'IMG-B-07 e IMG-B-08'
  ),

  ...hallazgo(
    'H-09', 'Alta', 'El contrato de respuesta cambia con la llave',
    'No hay contrato de respuesta declarado.',
    'Sin llave cada imagen trae 4 campos. Con llave trae hasta 10. Ademas cambia el dominio desde el que se sirven las imagenes.',
    'Sin llave: id, url, width, height\n           url: https://s3.us-west-2.amazonaws.com/cdn2.thecatapi.com/images/e9d.jpg\nCon llave: id, url, width, height, sub_id, created_at, breeds, categories, colours, tags\n           url: https://cdn2.thecatapi.com/images/ZZEs0Ozsy.jpg',
    'Una validacion de esquema falla de forma intermitente si no fija el modo de autenticacion. Un cliente desarrollado con llave y desplegado sin ella deja de encontrar campos, sin recibir ningun error.',
    'CTR-03'
  ),

  ...hallazgo(
    'H-11', 'Alta', 'La llave se acepta en la cadena de consulta',
    'No se documenta el canal por el que debe viajar la credencial.',
    'El servicio autentica igual con el encabezado x-api-key que con el parametro api_key en la URL.',
    'GET /breeds/search?q=beng                        (sin llave)  ->  403\nGET /breeds/search?q=beng  con x-api-key valida   ->  200\nGET /breeds/search?q=beng&api_key=<llave valida>  ->  200',
    'Una credencial en la URL queda registrada en los accesos del servidor, en el historial del navegador, en las cabeceras de referencia hacia terceros y en cualquier proxy intermedio. Deberia admitirse solo por encabezado.',
    'SEG-04'
  ),

  ...hallazgo(
    'H-04', 'Media', 'La validacion de parametros no es uniforme',
    'No se declara el comportamiento ante un valor invalido.',
    'Cuatro parametros se validan de forma estricta. Seis aceptan cualquier valor y lo ignoran.',
    'order=SIDEWAYS    ->  400 con mensaje que enumera los valores validos\nsize=gigantesco   ->  200 con resultados\nformat=xml        ->  200 con resultados\nparametro_inexistente=valor  ->  200 con resultados',
    'Un error de escritura en order se detecta al momento. El mismo error en size pasa inadvertido y el cliente cree que el filtro se aplico.',
    'IMG-B-06, IMG-B-09 e IMG-N-06'
  ),

  ...hallazgo(
    'H-05', 'Media', 'format no cambia la representacion',
    'El endpoint acepta un parametro format.',
    'Los tres valores probados devuelven la misma coleccion JSON con el mismo tipo de contenido.',
    'format=json  ->  200, Content-Type: application/json\nformat=src   ->  200, Content-Type: application/json\nformat=xml   ->  200, Content-Type: application/json',
    'La documentacion publica del servicio describe format=src como el modo que entrega la imagen. Una interfaz que apunte una etiqueta de imagen a esa URL mostrara texto JSON.',
    'IMG-B-10'
  ),

  ...hallazgo(
    'H-06', 'Media', 'Los encabezados de paginacion tienen una condicion no documentada',
    'La busqueda "puede" devolver los tres encabezados de paginacion.',
    'Aparecen solo cuando hay llave y el orden es determinista, es decir ASC o DESC. Con RANDOM no aparecen.',
    'order=ASC&page=2&limit=5  ->  Pagination-Count: 13492, Pagination-Page: 2, Pagination-Limit: 5\norder=RANDOM&limit=5      ->  sin encabezados de paginacion\nSin llave                 ->  sin encabezados de paginacion',
    'Un cliente que lea los encabezados sin comprobar su presencia calculara mal el numero de paginas.',
    'IMG-F-10 e IMG-B-11'
  ),

  ...hallazgo(
    'H-08', 'Media', 'Omitir q y enviarlo vacio dan respuestas opuestas',
    'No se define el comportamiento cuando no hay criterio de busqueda.',
    'Sin el parametro devuelve un listado. Con el parametro vacio devuelve un error.',
    'GET /breeds/search      ->  200, 10 razas\nGET /breeds/search?q=   ->  400, "q must be longer than or equal to 1 characters"',
    'Un formulario que envie el campo vacio recibe un error. El mismo formulario que omita el parametro recibe un listado. El resultado depende de un detalle de implementacion del cliente.',
    'BRD-F-10 y BRD-N-01'
  ),

  ...hallazgo(
    'H-10', 'Media', 'El campo message cambia de tipo',
    'No hay contrato de error declarado.',
    'En los errores 400 el campo message es un arreglo. En los 403 y 404 es una cadena.',
    'GET /images/search?limit=0   ->  400, "message":["limit must not be less than 1"]\nGET /recurso/inexistente     ->  404, "message":"Cannot GET /v1/recurso/inexistente"',
    'Un cliente que muestre el mensaje al usuario sin normalizar el tipo mostrara el texto correcto en unos casos y una representacion interna del arreglo en otros.',
    'CTR-07'
  ),

  ...hallazgo(
    'H-12', 'Media', 'Hay direcciones de imagen con extension .false',
    'No aplica. Es un defecto de datos.',
    'Algunas imagenes se devuelven con la extension literal .false en lugar de su formato real.',
    'GET /images/search?limit=1  con llave\n  ->  200, url: https://cdn2.thecatapi.com/images/DxlC8ufjq.false\nOtras observadas: VnCVpMNntO.false, j9jnwmu-T.false, 1J0ddrSeP.false, 8Z1KeS8Gn.false',
    'Un cliente que deduzca el formato por la extension no podra mostrar esas imagenes. Sugiere que un valor booleano se concateno donde iba la extension.',
    'IMG-F-02'
  ),

  ...hallazgo(
    'H-07', 'Baja', 'Un verbo no soportado responde 404',
    'No se declaran los metodos admitidos.',
    'Una peticion POST sobre un recurso de solo lectura devuelve 404 sin encabezado Allow.',
    'POST /images/search  ->  404, "message":"Cannot POST /v1/images/search"\nPOST /breeds/search?q=beng  ->  404, "message":"Cannot POST /v1/breeds/search?q=beng"',
    'El cliente no distingue entre una ruta que no existe y un metodo mal usado sobre una ruta que si existe. El estandar HTTP prevee 405 con el encabezado Allow.',
    'IMG-N-07 y BRD-N-07'
  ),

  salto(),

  h2('2.6 Riesgos funcionales'),

  tabla(
    ['Clave', 'Riesgo', 'Prob.', 'Impacto', 'Que se hizo'],
    [
      ['RF-01', 'Los filtros declarados no se aplican y el cliente recibe datos que cree filtrados.', 'Alta', 'Alto', 'Casos que revisan el contenido devuelto, no solo el codigo de estado.'],
      ['RF-02', 'La paginacion pierde o duplica elementos.', 'Media', 'Alto', 'Comparacion de identificadores entre paginas contiguas y prueba de la ultima pagina util.'],
      ['RF-03', 'La aleatoriedad no opera y una cache devuelve siempre lo mismo.', 'Media', 'Medio', 'Extracciones repetidas con comprobacion de variabilidad.'],
      ['RF-04', 'La busqueda omite coincidencias por mayusculas, acentos o espacios.', 'Media', 'Medio', 'Casos con variantes de escritura, nombres compuestos y coincidencias parciales.'],
      ['RF-05', 'La ausencia de coincidencias se comunica como error.', 'Baja', 'Medio', 'Caso con una consulta deliberadamente sin resultados.'],
      ['RF-06', 'Un valor frontera aceptado por la validacion no es atendido por la logica.', 'Alta', 'Alto', 'Valores frontera en los dos extremos de cada rango, comparando lo pedido con lo entregado.'],
    ],
    [800, 3200, 800, 900, ANCHO_V - 5700]
  ),

  espacio(220),

  h2('2.7 Riesgos tecnicos'),

  tabla(
    ['Clave', 'Riesgo', 'Prob.', 'Impacto', 'Que se hizo'],
    [
      ['RT-01', 'La aleatoriedad hace inestable cualquier comparacion de igualdad.', 'Alta', 'Alto', 'Ninguna prueba compara contra un identificador fijo. Se verifican invariantes.'],
      ['RT-02', 'Un 429 o un 403 por cuota se interpreta como fallo del servicio.', 'Alta', 'Medio', 'Metrica aparte que cuenta las respuestas por limite de cuota. Perfiles de carga moderados.'],
      ['RT-03', 'La variabilidad de la red produce fallos que no son defectos.', 'Alta', 'Medio', 'Un reintento en integracion continua. Umbrales con margen. Percentiles en lugar de maximos.'],
      ['RT-04', 'El contrato cambia sin aviso y rompe a los clientes.', 'Media', 'Alto', 'Validacion por esquema en cada ejecucion programada.'],
      ['RT-05', 'No hay entorno de pruebas: todo impacta produccion.', 'Alta', 'Alto', 'Volumen acotado. Carga alta excluida del flujo automatico.'],
      ['RT-06', 'La llave caduca y la suite falla en bloque sin causa aparente.', 'Media', 'Alto', 'Casos que distinguen un 403 por credencial de un fallo funcional. Llave gestionada como secreto.'],
      ['RT-07', 'Una cache devuelve respuestas antiguas y esconde una regresion.', 'Media', 'Medio', 'Comprobacion de variabilidad en las respuestas aleatorias.'],
      ['RT-08', 'Las imagenes se sirven desde otro dominio con su propia disponibilidad.', 'Media', 'Bajo', 'Se verifica la direccion, no se descarga el archivo.'],
    ],
    [800, 3200, 800, 900, ANCHO_V - 5700]
  ),

  salto(),

  h2('2.8 Dependencias y restricciones'),

  tabla(
    ['Dependencia', 'Que implica'],
    [
      ['Servicio de un tercero en produccion', 'No hay entorno de pruebas ni control sobre los datos. Toda prueba es de caja negra sobre un sistema vivo.'],
      ['Llave obligatoria para el endpoint de razas', 'Sin llave el ejercicio 2 no se ejecuta. La suite usa la llave publica de demostracion por defecto y admite una propia mediante secreto.'],
      ['Datos no controlados', 'El catalogo de imagenes cambia. El de razas es estable, por eso se usa como fuente de datos deterministas.'],
      ['Red publica', 'Los tiempos medidos incluyen latencia que no es del servicio. Se mitiga con percentiles y margen en los umbrales.'],
      ['Capa de cache y distribucion', 'Una respuesta servida desde cache no mide el servicio de origen.'],
      ['Autorizacion del proveedor', 'Las pruebas de carga alta y de intrusion sobre un servicio ajeno requieren permiso escrito. Sin el, quedan fuera de alcance.'],
    ],
    [3400, ANCHO_V - 3400]
  ),

  espacio(220),

  h2('2.9 Informacion que falta'),

  p('Peticiones concretas al equipo del servicio. Sin estas respuestas la verificacion se puede ejecutar, pero su resultado no es concluyente.'),

  tabla(
    ['Clave', 'Que se pide', 'Que desbloquea'],
    [
      ['I-01', 'Especificacion formal del contrato, preferentemente en OpenAPI.', 'Pruebas de contrato concluyentes'],
      ['I-02', 'Metodo de autenticacion, plan aplicable y una llave dedicada a pruebas.', 'Ejercicio 2 completo'],
      ['I-03', 'Valores validos de size, mime_types y format.', 'Pruebas negativas de esos parametros'],
      ['I-04', 'Condicion exacta de los encabezados de paginacion.', 'Verificacion de paginacion'],
      ['I-05', 'Efecto esperado de attach_image.', 'Cierre del hallazgo H-01'],
      ['I-06', 'Politica de limites: cuota, ventana y codigo al superarla.', 'Diseno del perfil de carga'],
      ['I-07', 'Acuerdo de nivel de servicio comprometido.', 'Criterios de aceptacion de desempeno'],
      ['I-08', 'Politica de versiones y de cambios incompatibles.', 'Estrategia de regresion'],
      ['I-09', 'Entorno de pruebas o ventana autorizada para carga alta.', 'Escenarios de estres, pico y resistencia'],
      ['I-10', 'Si el recorte de H-02 es decision de producto o defecto.', 'Clasificacion de H-02'],
      ['I-11', 'Si la llave en la URL es intencional.', 'Clasificacion de H-11'],
    ],
    [800, ANCHO_V - 4200, 3400]
  ),

  espacio(220),

  h2('2.10 Observacion sobre el material de la evaluacion'),

  nota(
    'Credencial expuesta.',
    'El enunciado incluye un enlace a la vista de cuenta del servicio con un identificador de acceso dentro de la direccion. Un identificador asi en un documento que circula es una exposicion de credenciales. Se recomienda sustituir el enlace por una referencia a la documentacion publica y entregar cualquier credencial por un canal aparte.',
    AMBAR
  ),

  salto(),
];

/* ------------------------------------------------------------------ */
/* 3. Plan                                                             */
/* ------------------------------------------------------------------ */

const plan = [
  h1('3. Plan de pruebas'),

  p('Estructurado con los elementos que la norma ISO/IEC/IEEE 29119-3 define para un plan de pruebas.'),

  h2('3.1 Objetivo'),

  p('Determinar si los dos endpoints:'),
  vineta('Cumplen el comportamiento declarado en su especificacion.'),
  vineta('Responden de forma predecible ante entradas invalidas y de borde.'),
  vineta('Mantienen un contrato de respuesta estable.'),
  vineta('Sostienen tiempos de respuesta y disponibilidad adecuados para produccion.'),

  p('Objetivo secundario: dejar registrados los puntos sin definir de la especificacion, para que el equipo del servicio pueda cerrarlos.'),

  h2('3.2 Alcance'),

  tabla(
    ['Dentro de alcance', 'Fuera de alcance', 'Motivo de la exclusion'],
    [
      ['Los dos endpoints indicados, version 1, en produccion.', 'El resto de endpoints del servicio.', 'El requerimiento delimita dos recursos.'],
      ['Todos los parametros declarados de cada uno.', 'Operaciones de escritura: cargar, votar, favoritos.', 'Fuera del requerimiento y con efectos sobre datos de terceros.'],
      ['Los dos modos de consumo: anonimo y con llave.', 'Pruebas de intrusion y analisis de vulnerabilidades.', 'Requieren permiso escrito del proveedor.'],
      ['Escenarios funcionales, negativos, de borde y de contrato.', 'Carga por encima del perfil nominal en el flujo automatico.', 'Mismo motivo. Los escenarios existen y se lanzan a mano.'],
      ['Codigos de estado, encabezados, tipo de contenido y estructura del cuerpo.', 'Descarga y verificacion del contenido de las imagenes.', 'Se sirven desde otro dominio. Se verifica la direccion, no el archivo.'],
      ['Tiempo de respuesta y disponibilidad bajo carga de humo y nominal.', 'Interfaz grafica y portal del proveedor.', 'El requerimiento se limita a la interfaz de programacion.'],
      ['Control de acceso, entradas hostiles y fuga de informacion.', 'Compatibilidad entre versiones del API.', 'No hay politica de versiones. Depende de I-08.'],
      ['Calidad de los mensajes de error.', 'Accesibilidad, localizacion, mantenibilidad y portabilidad.', 'No aplican a una interfaz de datos de un tercero.'],
    ],
    [3100, 3100, ANCHO_V - 6200]
  ),

  espacio(200),

  h2('3.3 Supuestos'),

  numerado('El servicio esta disponible durante la ventana de ejecucion. Si el proveedor cae, la corrida es invalida, no es un fallo del producto.'),
  numerado('La llave configurada es valida y su cuota alcanza para el volumen previsto.'),
  numerado('La latencia entre el agente de ejecucion y el servicio se mantiene dentro del margen de los umbrales.'),
  numerado('El catalogo de razas es estable y sus identificadores no cambian.'),
  numerado('El catalogo de imagenes cambia, asi que ninguna prueba depende de una imagen concreta.'),
  numerado('Las reglas de validacion deducidas de los mensajes de error siguen vigentes mientras no haya especificacion formal.'),
  numerado('La hora de la ejecucion programada corresponde a la Ciudad de Mexico, que no aplica horario de verano.'),

  h2('3.4 Datos de prueba'),

  p('No hay forma de sembrar datos. La estrategia es apoyarse en lo estable y no depender de lo que cambia.'),

  tabla(
    ['Conjunto', 'Valores', 'Para que'],
    [
      ['Razas de referencia', 'beng (Bengal), siam (Siamese), mcoo (Maine Coon), abys (Abyssinian)', 'Verificar contenido concreto'],
      ['Fronteras de limit', '0, 1, 10, 25, 50, 100, 101 y el texto abc', 'Valores frontera y clases de equivalencia'],
      ['Fronteras de q', 'vacio, 1, 30 y 31 caracteres, nombre con espacio', 'Valores frontera de longitud'],
      ['Valores de order', 'ASC, DESC, RANDOM y un valor invalido', 'Clases de equivalencia sobre un dominio cerrado'],
      ['Cargas hostiles', 'Inyeccion SQL, comodin, secuencia de comandos, recorrido de directorios', 'Seguridad de superficie'],
      ['Terminos para carga', 'Diez terminos recorridos de forma ciclica', 'Evitar que la cache distorsione la medicion'],
      ['Credenciales', 'Valida, invalida, vacia, en blanco, ausente y en la URL', 'Control de acceso'],
    ],
    [2400, 4000, ANCHO_V - 6400]
  ),

  espacio(160),

  nota(
    'Credenciales.',
    'No se guarda ninguna credencial en el repositorio. La llave se resuelve en tiempo de ejecucion desde un secreto y, si no existe, se usa la llave publica de demostracion del proveedor.'
  ),

  salto(),

  h2('3.5 Estrategia'),

  h3('Enfoque'),
  p('Prueba de caja negra guiada por riesgo. Cada caso existe porque mitiga un riesgo del capitulo 2, y cada riesgo tiene al menos un caso que lo cubre. La columna de trazabilidad de la matriz del capitulo 4 hace visible esa correspondencia.'),

  h3('Tipos de prueba'),

  tabla(
    ['Tipo', 'Casos', 'Que verifica', 'Tecnica', 'Herramienta'],
    [
      ['Funcional', String(porTipo('Funcional')), 'El comportamiento declarado con entradas validas', 'Clases de equivalencia', 'Playwright'],
      ['Negativo', String(porTipo('Negativo')), 'El rechazo de lo invalido, con mensaje util', 'Clases de equivalencia invalidas', 'Playwright'],
      ['Borde', String(porTipo('Borde')), 'Los valores frontera de cada rango', 'Analisis de valores frontera', 'Playwright'],
      ['Contrato', String(porTipo('Contrato')), 'La forma de la respuesta en sus dos variantes', 'Validacion por esquema', 'Playwright con Ajv'],
      ['Seguridad', String(porTipo('Seguridad')), 'Control de acceso, entradas hostiles, fuga de datos', 'Casos de abuso', 'Playwright'],
      ['No funcional', String(porTipo('No funcional')), 'Tiempo, compresion, cache, origen cruzado, disponibilidad', 'Medicion sobre series cortas', 'Playwright'],
      ['Desempeno', '5 escenarios', 'Comportamiento temporal y capacidad bajo carga', 'Perfiles de carga', 'k6'],
    ],
    [1700, 900, 3600, 2200, ANCHO_V - 8400]
  ),

  espacio(200),

  h3('Cuatro decisiones de diseno'),

  numerado('Ninguna prueba compara contra un dato aleatorio concreto. El endpoint de imagenes devuelve resultados aleatorios por definicion. Se verifican invariantes: forma, cantidad, unicidad y cumplimiento del contrato.'),
  numerado('Cada caso adjunta su evidencia al reporte: peticion, codigo, encabezados, tiempo y respuesta. El capitulo 5 recoge esa evidencia.'),
  numerado('Cuando el servicio tiene un defecto ya documentado, el caso afirma el comportamiento real y registra la desviacion como anotacion. La suite sigue verde y el defecto sigue visible. Si el proveedor lo corrige, el caso falla y obliga a revisar el hallazgo.'),
  numerado('El volumen de las pruebas de carga se mantiene bajo. Los escenarios que pueden degradar el servicio existen pero no corren de forma automatica.'),

  h2('3.6 Escenarios'),

  tabla(
    ['Grupo', 'Escenarios cubiertos'],
    [
      ['Funcionales', 'Busqueda sin parametros y con limit en varios valores. Campos obligatorios. Unicidad dentro de la pagina. Variabilidad de los resultados aleatorios. Filtro por raza asociada. Paginas consecutivas sin traslape. Estabilidad del orden determinista. Encabezados de paginacion. Busqueda de razas exacta, parcial, compuesta y en distintas grafias. Campos descriptivos e imagen asociada.'],
      ['Negativos', 'limit igual a cero, negativo, no numerico y por encima del maximo. page negativo. order fuera del conjunto. q vacio y q demasiado largo. Verbo no soportado. Ruta inexistente. Acceso sin llave, con llave invalida, vacia y en blanco. Llave en la cadena de consulta.'],
      ['De borde', 'Fronteras de cada rango, en el limite y un paso fuera. Longitud minima y maxima de q. Pagina mas alla del ultimo resultado. Ultima pagina util calculada desde el total. Valores no contemplados en parametros sin dominio. Parametros desconocidos. Coleccion vacia como resultado valido.'],
      ['Validaciones tecnicas', 'Codigo de estado por clase de resultado. Tipo de contenido coherente con el cuerpo. Estructura validada contra esquema en los dos modos. Forma uniforme del cuerpo de error. Encabezados de paginacion. Politica de origen cruzado. Compresion. Validador de cache. Ausencia de encabezados que revelen la tecnologia. Transporte cifrado.'],
    ],
    [2200, ANCHO_V - 2200]
  ),

  salto(),

  h2('3.7 Criterios de aceptacion'),

  p('Una ejecucion se aprueba cuando se cumplen las diez condiciones.'),

  tabla(
    ['Clave', 'Criterio', 'Umbral'],
    [
      ['CA-01', 'Casos criticos que pasan', '100 por ciento'],
      ['CA-02', 'Casos totales que pasan', 'No menos del 98 por ciento'],
      ['CA-03', 'Defectos de severidad alta abiertos sin analizar', 'Ninguno'],
      ['CA-04', 'Mediana del tiempo de respuesta', 'Menos de 1500 ms'],
      ['CA-05', 'Percentil 95 en carga nominal', 'Menos de 1500 ms'],
      ['CA-06', 'Percentil 99', 'Menos de 3000 ms'],
      ['CA-07', 'Tasa de peticiones fallidas en carga nominal', 'Menos del 1 por ciento'],
      ['CA-08', 'Disponibilidad en series sostenidas', 'No menos del 95 por ciento'],
      ['CA-09', 'Desviaciones de contrato no documentadas', 'Ninguna'],
      ['CA-10', 'Casos de seguridad que pasan', '100 por ciento'],
    ],
    [900, ANCHO_V - 4700, 3800]
  ),

  espacio(160),

  p('Los umbrales de tiempo se derivan de la medicion propia del capitulo 5: mediana de 204 ms y maximo de 320 ms en 20 lecturas consecutivas. El margen cubre la variabilidad de la red publica. Cuando el proveedor publique su acuerdo de nivel de servicio, estos valores deben sustituirse por los comprometidos.'),

  h2('3.8 Criterios de salida'),

  p('El ciclo se cierra cuando se cumplen las siete condiciones.'),

  numerado('Todos los casos se ejecutaron, o su omision esta justificada y registrada.'),
  numerado('Se cumplen los criterios CA-01 a CA-10, o su incumplimiento lo acepto por escrito el responsable del producto.'),
  numerado('Todo defecto de severidad alta esta corregido y verificado, o tiene una decision documentada de aplazamiento con su riesgo residual.'),
  numerado('Los defectos de severidad media y baja estan registrados, clasificados y planificados.'),
  numerado('Los puntos A-01 a A-10 tienen respuesta, o consta la decision de continuar sin ella.'),
  numerado('El informe de cierre esta publicado con la cobertura alcanzada, los defectos abiertos y los riesgos residuales.'),
  numerado('La suite automatizada lleva al menos tres ejecuciones programadas consecutivas sin fallos ajenos al producto.'),

  espacio(180),

  h2('3.9 Cobertura declarada'),

  p('Segun el modelo de calidad de ISO/IEC 25010:2023.'),

  tabla(
    ['Caracteristica', 'Como se verifica', 'Estado'],
    [
      ['Adecuacion funcional', 'Escenarios funcionales sobre ambos endpoints y todos sus parametros', 'Cubierta'],
      ['Eficiencia de desempeno', 'Medicion de tiempos en la suite y escenarios de k6', 'Cubierta'],
      ['Compatibilidad', 'Validacion de contrato por esquema y politica de origen cruzado', 'Cubierta'],
      ['Fiabilidad', 'Series sostenidas de peticiones y escenario de resistencia', 'Cubierta'],
      ['Seguridad', 'Control de acceso, entradas hostiles y fuga de informacion', 'Parcial'],
      ['Usabilidad', 'Calidad de los mensajes de error', 'Parcial'],
      ['Mantenibilidad', 'No se dispone del codigo del servicio', 'Fuera de alcance'],
      ['Portabilidad', 'Servicio gestionado por un tercero', 'Fuera de alcance'],
      ['Flexibilidad', 'No verificable sin permiso para cargas altas', 'Fuera de alcance'],
    ],
    [3000, ANCHO_V - 5400, 2400]
  ),

  salto(),
];

/* ------------------------------------------------------------------ */
/* 4. Matriz de casos (horizontal)                                     */
/* ------------------------------------------------------------------ */

/** Construye la lista de pasos ejecutables de un caso. */
const pasosDe = (caso) => {
  const lineas = [];
  let n = 1;
  const peticiones = caso.peticiones ?? [];

  if (peticiones.length === 0) {
    lineas.push(`${n++}. Preparar la peticion descrita en la columna de entrada.`);
  } else {
    for (const req of peticiones) lineas.push(`${n++}. Enviar ${urlCompleta(req)}`);
  }

  lineas.push(`${n++}. Leer el codigo de estado, los encabezados y el cuerpo de la respuesta.`);
  for (const v of caso.validaciones) lineas.push(`${n++}. Comprobar: ${v.toLowerCase()}.`);

  return lineas;
};

/** Encabezados enviados en el caso. */
const encabezadosDe = (caso) => {
  const lineas = ['Accept: application/json'];
  const auth = String(caso.auth ?? '');
  if (auth.includes('con llave')) lineas.push('x-api-key: DEMO-API-KEY');
  if (auth.includes('sin llave')) lineas.push('(tambien sin x-api-key)');
  if (auth.includes('invalida')) lineas.push('x-api-key: valor invalido');
  if (auth.includes('vacia')) lineas.push('x-api-key: (vacia)');
  if (auth.includes('blanco')) lineas.push('x-api-key: (un espacio)');
  if (auth.includes('cadena de consulta')) lineas.push('sin encabezado; llave en la URL');
  if (caso.id === 'NFN-04') lineas.push('Accept-Encoding: gzip, deflate, br');
  if (caso.id === 'NFN-05') lineas.push('Origin: https://consumidor-de-prueba.example');
  return lineas;
};

const ANCHOS_DISENO = [800, 1100, 2000, 1800, 2700, 800, 800, 2200, 2200];

const CABECERA_DISENO = [
  'ID', 'Tipo y prioridad', 'Descripcion del caso', 'Peticion', 'Pasos',
  'Status esp.', 'Status real', 'Resultado esperado', 'Resultado real',
];

const filaDiseno = (c) => [
  c.id,
  [c.tipo, `Prioridad ${c.prioridad.toLowerCase()}`, `Riesgo ${c.riesgo}`],
  c.objetivo,
  [codigo(urlCompleta(c.endpoint.replace(/^(GET|POST) /, '$1 '))), ...encabezadosDe(c).map((l) => codigo(l))],
  pasosDe(c).map((l) => codigo(l)),
  c.statusEsperado,
  c.statusReal,
  c.esperado,
  c.resultadoReal,
];

const gruposCasos = [
  { titulo: '4.1 Busqueda de imagenes: casos funcionales', prefijo: 'IMG-F' },
  { titulo: '4.2 Busqueda de imagenes: casos negativos', prefijo: 'IMG-N' },
  { titulo: '4.3 Busqueda de imagenes: casos de borde', prefijo: 'IMG-B' },
  { titulo: '4.4 Busqueda de razas: casos funcionales', prefijo: 'BRD-F' },
  { titulo: '4.5 Busqueda de razas: casos negativos y de borde', prefijo: 'BRD-N' },
  { titulo: '4.6 Contrato de respuesta', prefijo: 'CTR' },
  { titulo: '4.7 Seguridad de superficie', prefijo: 'SEG' },
  { titulo: '4.8 Atributos no funcionales', prefijo: 'NFN' },
];

const matriz = [
  h1('4. Diseno y resultado de los casos de prueba'),

  p(`Los ${CASOS.length} casos, agrupados por endpoint y por tipo de prueba. Cada fila trae el diseno del caso y el resultado de su ejecucion real contra el servicio.`),

  tabla(
    ['Columna', 'Que contiene'],
    [
      ['ID', 'Identificador del caso. Es el mismo que usa el codigo de la suite y el reporte de ejecucion.'],
      ['Tipo y prioridad', 'Tipo de prueba, prioridad de ejecucion y riesgo del capitulo 2 que el caso mitiga.'],
      ['Descripcion del caso', 'Que se quiere comprobar.'],
      ['Peticion', 'Metodo, ruta y encabezados enviados.'],
      ['Pasos', 'Secuencia ejecutable: peticiones enviadas y comprobaciones realizadas sobre la respuesta.'],
      ['Status esp.', 'Codigo de estado HTTP previsto por el diseno del caso.'],
      ['Status real', 'Codigo de estado devuelto por el servicio en la ejecucion.'],
      ['Resultado esperado', 'Respuesta prevista, con sus valores y mensajes concretos.'],
      ['Resultado real', 'Lo que devolvio el servicio y si coincide o no con lo esperado.'],
    ],
    [2200, ANCHO_H - 2200],
    ANCHO_H
  ),

  espacio(160),

  p('El cuerpo completo de cada respuesta esta en el capitulo 5.'),

  ...gruposCasos.flatMap((g) => {
    const casos = CASOS.filter((c) => c.id.startsWith(g.prefijo));
    if (casos.length === 0) return [];
    return [
      salto(),
      h2(g.titulo),
      tabla(CABECERA_DISENO, casos.map(filaDiseno), ANCHOS_DISENO, ANCHO_H, 15),
    ];
  }),
];

/* ------------------------------------------------------------------ */
/* 5. Evidencia                                                        */
/* ------------------------------------------------------------------ */

const colorEstado = (st) => (st >= 500 ? ROJO : st >= 400 ? AMBAR : VERDE);

const bloqueEvidencia = (caso) => {
  const registros = evidencias.casos[caso.id] ?? [];
  const partes = [
    new Paragraph({
      spacing: { before: 260, after: 100 },
      keepNext: true,
      children: [
        new TextRun({ text: caso.id, size: 22, bold: true, color: AZUL, font: 'Consolas' }),
        new TextRun({ text: `   ${caso.objetivo}`, size: 20, bold: true }),
      ],
    }),
  ];

  registros.forEach((r, i) => {
    const encabezados = r.hdr
      ? Object.entries(r.hdr).map(([k, v]) => `${k}: ${v}`).join('\n')
      : 'sin encabezados destacables';

    const filas = [
      ['Peticion', [codigo(urlCompleta(r.req))]],
      ['Autenticacion', r.auth],
      ['Respuesta', `${r.st}   ${r.ms !== undefined ? r.ms + ' ms' : ''}${r.n !== undefined && r.n !== null ? `   ${r.n} elemento${r.n === 1 ? '' : 's'}` : ''}`, { color: colorEstado(r.st) }],
      ['Encabezados', encabezados.split('\n').map((l) => codigo(l))],
    ];

    if (r.campos) filas.push(['Campos', [codigo(r.campos)]]);
    if (r.body) filas.push(['Cuerpo', String(r.body).split('\n').map((l) => codigo(l))]);
    if (r.medicion) filas.push(['Medicion', r.medicion]);
    filas.push(['Resultado', r.veredicto]);

    if (registros.length > 1) {
      partes.push(
        new Paragraph({
          spacing: { before: i === 0 ? 60 : 150, after: 60 },
          keepNext: true,
          children: [new TextRun({ text: `Peticion ${i + 1} de ${registros.length}`, size: 17, bold: true, color: TENUE })],
        })
      );
    }

    partes.push(ficha(filas, 1900, ANCHO_H));
  });

  if (registros.length === 0) {
    partes.push(p('Sin evidencia capturada para este caso.', { color: TENUE, italics: true }));
  }

  partes.push(espacio(60));
  return partes;
};

const gruposEvidencia = [
  { titulo: '5.1 Busqueda de imagenes: escenarios funcionales', prefijo: 'IMG-F' },
  { titulo: '5.2 Busqueda de imagenes: escenarios negativos', prefijo: 'IMG-N' },
  { titulo: '5.3 Busqueda de imagenes: escenarios de borde', prefijo: 'IMG-B' },
  { titulo: '5.4 Busqueda de razas: escenarios funcionales', prefijo: 'BRD-F' },
  { titulo: '5.5 Busqueda de razas: escenarios negativos y de borde', prefijo: 'BRD-N' },
  { titulo: '5.6 Contrato de respuesta', prefijo: 'CTR' },
  { titulo: '5.7 Seguridad de superficie', prefijo: 'SEG' },
  { titulo: '5.8 Atributos no funcionales', prefijo: 'NFN' },
];

const evidencia = [
  h1('5. Evidencia de ejecucion'),

  p('Peticion, respuesta y resultado de cada caso, capturados contra el entorno de produccion.'),

  ficha([
    ['Entorno', 'https://api.thecatapi.com/v1'],
    ['Credencial', 'Llave publica de demostracion DEMO-API-KEY, en el encabezado x-api-key salvo donde se indique lo contrario'],
    ['Fecha de captura', new Date(evidencias.capturadoEn).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Mexico_City' }) + ' (Ciudad de Mexico)'],
    ['Casos con evidencia', `${Object.keys(evidencias.casos).length} de ${CASOS.length}`],
  ], 2600, ANCHO_H),

  espacio(150),

  nota(
    'Como leer cada ficha.',
    'Peticion es la URL exacta enviada. Autenticacion indica si se envio la llave y por que canal. Respuesta trae el codigo de estado, el tiempo y el numero de elementos. Encabezados recoge solo los relevantes para el caso. Cuerpo es la respuesta, recortada cuando es extensa. Resultado dice si el comportamiento fue correcto o que desviacion se detecto.'
  ),

  ...gruposEvidencia.flatMap((g) => {
    const casos = CASOS.filter((c) => c.id.startsWith(g.prefijo));
    if (casos.length === 0) return [];
    return [salto(), h2(g.titulo), ...casos.flatMap(bloqueEvidencia)];
  }),

  salto(),
];

/* ------------------------------------------------------------------ */
/* 6. Priorizacion                                                     */
/* ------------------------------------------------------------------ */

const priorizacion = [
  h1('6. Priorizacion'),

  p('Con dos horas disponibles, el criterio no es ejecutar lo mas rapido sino ejecutar aquello cuyo fallo impide liberar.'),

  h2('6.1 Primera fase: primeros 40 minutos'),

  p('Los casos marcados como criticos. Responden a cuatro preguntas: el servicio devuelve datos, los devuelve con la forma acordada, rechaza lo invalido y no deja pasar a quien no tiene llave.'),

  tabla(
    ['Bloque', 'Casos', 'Por que va primero'],
    [
      ['Camino principal', 'IMG-F-01, IMG-F-02, IMG-F-03, BRD-F-01, BRD-F-02, BRD-F-06', 'Si el camino principal falla, lo demas no importa.'],
      ['Contrato de respuesta', 'CTR-01 a CTR-05', 'Una ruptura aqui afecta a todos los clientes a la vez.'],
      ['Control de acceso', 'SEG-01 a SEG-04, SEG-08, SEG-09', 'Un fallo aqui no se aplaza.'],
      ['Validacion de entradas', 'IMG-N-01, IMG-N-04, IMG-N-06, BRD-N-01, BRD-N-02', 'Si lo invalido se acepta, el cliente recibe datos que cree filtrados.'],
      ['Fronteras de mayor riesgo', 'IMG-B-01, IMG-B-02, IMG-B-03, BRD-N-04', 'Los valores frontera concentran la mayor parte de los defectos.'],
      ['Paginacion', 'IMG-F-08, IMG-F-10', 'Perder datos sin aviso es el peor modo de fallo.'],
      ['Tiempo y disponibilidad', 'NFN-01, NFN-02, NFN-07 y el escenario de humo', 'Detecta una degradacion grave en pocos minutos.'],
    ],
    [2600, 3800, ANCHO_V - 6400]
  ),

  espacio(200),

  h2('6.2 Segunda fase: 40 minutos restantes y siguiente ciclo'),

  tabla(
    ['Bloque', 'Casos'],
    [
      ['Resto de escenarios de borde', 'IMG-B-04 a IMG-B-11'],
      ['Variantes de escritura y coincidencias parciales', 'BRD-F-03 a BRD-F-05, BRD-F-09, BRD-F-10'],
      ['Seguridad de menor severidad', 'SEG-05, SEG-05b, SEG-06, SEG-07, SEG-10'],
      ['No funcionales complementarios', 'NFN-03 a NFN-06, NFN-08'],
      ['Carga nominal', 'Escenario de k6, cinco minutos de ejecucion continua'],
      ['Carga alta', 'Estres, pico y resistencia, con autorizacion del proveedor'],
    ],
    [4000, ANCHO_V - 4000]
  ),

  espacio(200),

  h2('6.3 Escenarios criticos para una liberacion'),

  p('Un fallo en cualquiera de estos cinco puntos detiene la liberacion.'),

  tabla(
    ['Escenario', 'Por que detiene la liberacion'],
    [
      ['El control de acceso cede', 'Si el recurso protegido responde sin llave valida, o la llave viaja por un canal que la expone, deja de ser un problema de calidad y pasa a ser de seguridad.'],
      ['El contrato cambia sin aviso', 'Desaparece un campo, cambia un tipo o cambia la forma del error. Rompe a todos los clientes a la vez y sin sintoma previo.'],
      ['La paginacion pierde o duplica elementos', 'El cliente pierde datos y nadie lo nota hasta que el dato hace falta.'],
      ['La validacion de entradas se relaja', 'Lo invalido empieza a aceptarse y el servicio devuelve resultados que el cliente cree filtrados.'],
      ['El tiempo de respuesta supera el acuerdo', 'Un percentil 95 por encima del umbral en carga nominal anticipa una caida en produccion.'],
    ],
    [3400, ANCHO_V - 3400]
  ),

  espacio(200),

  h2('6.4 Riesgos que se comunicarian al equipo'),

  tabla(
    ['Riesgo', 'A quien', 'Que se le dice'],
    [
      ['El recorte silencioso de la coleccion', 'Producto y arquitectura', 'Es el hallazgo de mayor impacto. Un cliente sin llave pierde datos sin recibir senal. Hay que decidir: corregir el limite o comunicarlo con un encabezado.'],
      ['La llave admitida en la URL', 'Seguridad y arquitectura', 'La credencial queda en registros, historial y proxies. Debe admitirse solo por encabezado.'],
      ['Los filtros que no filtran', 'Desarrollo', 'mime_types y attach_image se aceptan y se ignoran. Cualquier funcion construida sobre ellos parte de un supuesto falso.'],
      ['El contrato doble segun la llave', 'Arquitectura y documentacion', 'Obliga a cada cliente a saber su propio modo de autenticacion para saber que campos esperar. Documentarlo o unificarlo.'],
      ['La falta de entorno de pruebas', 'Gestion', 'Toda verificacion consume cuota de produccion. Limita volumen, frecuencia y tipo de prueba.'],
      ['La especificacion incompleta', 'Producto', 'Diez puntos abiertos impiden afirmar que el servicio es correcto. Se puede afirmar que es consistente, que no es lo mismo.'],
      ['La dependencia de un proveedor externo', 'Gestion y operacion', 'No hay control sobre disponibilidad, cambios ni cuotas. Conviene definir que hace el producto cuando el proveedor no responde.'],
    ],
    [3000, 2400, ANCHO_V - 5400]
  ),

  salto(),
];

/* ------------------------------------------------------------------ */
/* 7. Automatizacion                                                   */
/* ------------------------------------------------------------------ */

const automatizacion = [
  h1('7. Propuesta de automatizacion'),

  h2('7.1 Que se automatiza'),

  tabla(
    ['Conjunto', 'Por que', 'Cuando corre'],
    [
      ['Casos funcionales del camino principal', 'Se repiten en cada ciclo y su resultado es objetivo', 'Cada PR y a diario'],
      ['Casos negativos y de borde', 'Son muchos, mecanicos y faciles de olvidar a mano', 'Cada PR y a diario'],
      ['Validacion de contrato', 'Detecta una ruptura antes que los clientes', 'Cada PR y a diario'],
      ['Control de acceso y entradas hostiles', 'Una regresion aqui es inaceptable', 'Cada PR y a diario'],
      ['Escenario de humo de carga', 'Detecta una degradacion grave en un minuto', 'A diario'],
      ['Escenario de carga nominal', 'Verifica el acuerdo de nivel de servicio', 'A diario y antes de liberar'],
      ['Estres, pico y resistencia', 'Duran mucho e impactan un servicio ajeno', 'A demanda, con autorizacion'],
    ],
    [3400, 4200, ANCHO_V - 7600]
  ),

  espacio(200),

  h2('7.2 Que sigue siendo manual'),

  tabla(
    ['Actividad', 'Por que no se automatiza'],
    [
      ['Exploracion de un endpoint nuevo o modificado', 'Automatizar antes de entender produce casos que verifican una suposicion equivocada.'],
      ['Valorar si un mensaje de error es util', 'Se puede comprobar que el mensaje existe. Que sea comprensible requiere juicio.'],
      ['Contrastar documentacion contra comportamiento', 'Detectar un punto ambiguo es lectura critica, no ejecucion.'],
      ['Pruebas de intrusion', 'Requieren autorizacion, herramientas especializadas y criterio humano.'],
      ['Primera verificacion de un defecto corregido', 'Conviene hacerla a mano. Despues se incorpora como caso de regresion.'],
    ],
    [3600, ANCHO_V - 3600]
  ),

  espacio(200),

  h2('7.3 Herramientas'),

  tabla(
    ['Herramienta', 'Para que', 'Por que se eligio'],
    [
      ['Playwright', 'Suite funcional, negativa, de borde, contrato y seguridad', 'Su contexto de peticiones permite probar API sin navegador. Trae reporte navegable, adjuntos de evidencia, reintentos y trazas. Sirve tambien si mas adelante hay que cubrir una interfaz.'],
      ['Ajv con esquemas JSON', 'Validacion de contrato', 'El contrato queda expresado como dato y no como codigo. El esquema sirve ademas de documentacion.'],
      ['k6', 'Escenarios de carga', 'Los escenarios se escriben en JavaScript, los umbrales son parte del script y el resultado es un dato estructurado que se integra sin conversion manual.'],
      ['GitHub Actions', 'Orquestacion de las tres formas de ejecucion', 'Vive junto al codigo, no anade infraestructura y cubre las tres necesidades: manual, por PR y programada.'],
      ['GitHub Pages', 'Publicacion del portal y del historico', 'El resultado deja de estar dentro de una bitacora y pasa a ser consultable por cualquier interesado.'],
      ['Postman y Newman', 'No se adoptaron', 'La coleccion en JSON es dificil de revisar en un cambio y las aserciones quedan dispersas. Para exploracion manual siguen siendo comodos; para una suite versionada, no.'],
    ],
    [2200, 3000, ANCHO_V - 5200]
  ),

  espacio(200),

  h2('7.4 Enfoque'),

  tabla(
    ['Nivel', 'Contenido', 'Duracion', 'Cuando corre'],
    [
      ['Humo', 'Casos criticos de ambos endpoints', 'Menos de 2 min', 'Al inicio de toda ejecucion'],
      ['Regresion funcional', 'Suite completa', 'De 4 a 6 min', 'Cada PR y cada ejecucion programada'],
      ['Contrato', 'Esquemas de ambas representaciones y del error', 'Menos de 1 min', 'Dentro de la regresion y por separado'],
      ['Carga continua', 'Humo y carga nominal', 'De 6 a 7 min', 'Cada ejecucion programada'],
      ['Carga a demanda', 'Estres, pico y resistencia', 'De 9 a 30 min', 'Manual, con autorizacion'],
    ],
    [2400, 4400, 1700, ANCHO_V - 8500]
  ),

  espacio(160),

  p('La base de la piramide la ocupan las verificaciones de contrato: son rapidas y detectan el fallo mas costoso. Encima van los casos funcionales y de borde. Arriba, los escenarios de carga largos, que solo corren cuando alguien los pide.'),

  salto(),
];

/* ------------------------------------------------------------------ */
/* 8. Implementacion                                                   */
/* ------------------------------------------------------------------ */

const implementacion = [
  h1('8. Implementacion entregada'),

  p('La propuesta esta implementada. El repositorio contiene la suite, los escenarios de carga, el flujo de integracion continua y el portal de resultados.'),

  ficha([
    ['Repositorio', 'https://github.com/lrbg/TESTAPI'],
    ['Portal de resultados', 'https://lrbg.github.io/TESTAPI/'],
    ['Analisis publicado', 'https://lrbg.github.io/TESTAPI/analisis.html'],
    ['Catalogo de casos', 'https://lrbg.github.io/TESTAPI/casos.html'],
    ['Evidencia por caso', 'https://lrbg.github.io/TESTAPI/evidencia.html'],
    ['Reporte historico', 'https://lrbg.github.io/TESTAPI/historico.html'],
  ], 2800),

  espacio(200),

  h2('8.1 Formas de ejecucion'),

  tabla(
    ['Via', 'Cuando se dispara', 'Que ejecuta', 'Que produce'],
    [
      ['Manual', 'A demanda desde la pestana de acciones', 'Configurable: conjunto de pruebas y escenario de carga', 'Publica el portal y actualiza el historico de forma opcional'],
      ['Por solicitud de incorporacion', 'Toda solicitud dirigida a la rama principal', 'Suite funcional completa y escenario de humo', 'Comentario con el resultado en la propia solicitud. No toca historico ni incidencias'],
      ['Programada', 'Todos los dias a las 16:00 hora de la Ciudad de Mexico', 'Suite completa, humo y carga nominal', 'Actualiza el historico, ejecuta el triaje de incidencias y publica el portal'],
    ],
    [1800, 3400, 3400, ANCHO_V - 8600]
  ),

  espacio(160),

  nota(
    'Sobre la hora.',
    'GitHub interpreta las expresiones de calendario en UTC. Mexico dejo de aplicar horario de verano en 2022, asi que la Ciudad de Mexico esta todo el ano en UTC menos 6. Las 16:00 locales son las 22:00 UTC de forma estable, sin ajustes dos veces al ano. La expresion usada es 0 22 * * *.'
  ),

  h2('8.2 El agente de triaje'),

  p('Lee el resumen de la ejecucion y mantiene al dia el tablero de incidencias. Identifica cada fallo por una huella derivada del identificador del caso, asi que un fallo intermitente genera una sola incidencia con su historial, no una por ejecucion.'),

  tabla(
    ['Situacion', 'Que hace el agente'],
    [
      ['Fallo nuevo', 'Abre una incidencia con evidencia, severidad y pasos de reproduccion'],
      ['Fallo que ya tiene incidencia abierta', 'Anade un comentario con la reaparicion, sin duplicar'],
      ['Caso que vuelve a pasar', 'Comenta y cierra la incidencia'],
      ['Umbral de carga incumplido', 'Abre una incidencia con la tabla de mediciones del escenario'],
    ],
    [3600, ANCHO_V - 3600]
  ),

  espacio(160),

  p('Los comentarios y las etiquetas puestas a mano se conservan. El agente no sobrescribe el trabajo de una persona.'),

  h2('8.3 Reporte historico'),

  p('Cada ejecucion programada deja su registro en una rama separada de la principal, para que las mediciones no mezclen su historial con el del codigo ni disparen ejecuciones nuevas. Se conservan 180 ejecuciones, unos seis meses de corridas diarias.'),

  p('El portal muestra los resultados por ejecucion, la evolucion del percentil 95 de cada escenario y la comparacion del valor actual con la media de las diez ejecuciones anteriores. Se usa el percentil 95 y no el promedio porque el promedio esconde los tiempos altos que sufre una parte de los clientes.'),

  salto(),
];

/* ------------------------------------------------------------------ */
/* 9. Anexo                                                            */
/* ------------------------------------------------------------------ */

const anexo = [
  h1('9. Anexo: trazabilidad normativa'),

  h2('9.1 Que aporta cada norma'),

  tabla(
    ['Norma', 'Que aporta'],
    [
      ['ISO/IEC 25010:2023', 'Modelo de calidad del producto. Ordena la cobertura por caracteristica y evita que la verificacion se limite a lo funcional.'],
      ['ISO/IEC/IEEE 29119-1 y 29119-2', 'Conceptos y proceso de prueba. Sustentan la estructura del plan y el ciclo de diseno, ejecucion y cierre.'],
      ['ISO/IEC/IEEE 29119-3', 'Documentacion de prueba. Define la forma del plan, de la especificacion de casos, de la bitacora de ejecucion, del reporte de incidencias y del informe de cierre.'],
      ['ISO/IEC/IEEE 29119-4', 'Tecnicas de prueba. Clases de equivalencia, analisis de valores frontera y prueba basada en riesgo.'],
      ['ISO/IEC 20000-1', 'Gestion del servicio. Encuadra el acuerdo de nivel de servicio, la gestion de incidencias y el seguimiento del desempeno.'],
    ],
    [3200, ANCHO_V - 3200]
  ),

  espacio(200),

  h2('9.2 Donde vive cada artefacto'),

  tabla(
    ['Artefacto de la norma', 'Donde esta'],
    [
      ['Test Plan', 'Capitulo 3'],
      ['Test Case Specification', 'Capitulo 4 y catalogo del repositorio'],
      ['Test Environment Requirements', 'Configuracion de la suite y modulo de entorno del repositorio'],
      ['Test Execution Log', 'Capitulo 5 y evidencia adjunta a cada caso en el reporte navegable'],
      ['Test Incident Report', 'Incidencias del repositorio y formularios de reporte'],
      ['Test Completion Report', 'Resumen de ejecucion y reporte historico del portal'],
    ],
    [4200, ANCHO_V - 4200]
  ),

  espacio(280),

  p('Fin del documento.', { color: TENUE, italics: true }),
];

/* ------------------------------------------------------------------ */
/* Ensamblado                                                          */
/* ------------------------------------------------------------------ */

const encabezado = new Header({
  children: [
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 60 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'DEDCD6', space: 6 } },
      children: [new TextRun({ text: 'Evaluacion tecnica de calidad. Endpoints de busqueda de imagenes y razas', size: 15, color: TENUE })],
    }),
  ],
});

const pie = new Footer({
  children: [
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({ text: 'Pagina ', size: 15, color: TENUE }),
        new TextRun({ children: [PageNumber.CURRENT], size: 15, color: TENUE }),
        new TextRun({ text: ' de ', size: 15, color: TENUE }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 15, color: TENUE }),
      ],
    }),
  ],
});

const vertical = { page: { size: { width: LETTER.width, height: LETTER.height }, margin: { top: MARGEN, bottom: MARGEN, left: MARGEN, right: MARGEN } } };
const horizontal = { page: { size: { width: LETTER.width, height: LETTER.height, orientation: PageOrientation.LANDSCAPE }, margin: { top: MARGEN_H, bottom: MARGEN_H, left: MARGEN_H, right: MARGEN_H } } };

const doc = new Document({
  creator: 'lrbg',
  title: 'Evaluacion tecnica de calidad: endpoints de busqueda de imagenes y razas',
  description: 'Analisis, plan de pruebas, casos con evidencia, priorizacion y propuesta de automatizacion',
  numbering: {
    config: [
      { reference: 'vinetas', levels: [{ level: 0, format: 'bullet', text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 220 } } } }] },
      { reference: 'numeros', levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 430, hanging: 250 } } } }] },
    ],
  },
  styles: { default: { document: { run: { font: 'Calibri', size: 21 } } } },
  sections: [
    { properties: vertical, children: portada },
    { properties: vertical, headers: { default: encabezado }, footers: { default: pie }, children: [...resumen, ...analisis, ...plan] },
    { properties: horizontal, headers: { default: encabezado }, footers: { default: pie }, children: [...matriz, ...evidencia] },
    { properties: vertical, headers: { default: encabezado }, footers: { default: pie }, children: [...priorizacion, ...automatizacion, ...implementacion, ...anexo] },
  ],
});

const salida = path.join(raiz, 'entregables', 'Evaluacion-tecnica-QA-API.docx');
fs.mkdirSync(path.dirname(salida), { recursive: true });

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(salida, buffer);
  const conEvidencia = Object.keys(evidencias.casos).length;
  console.log(`Documento generado: ${salida}`);
  console.log(`Casos en la matriz: ${CASOS.length}. Casos con evidencia: ${conEvidencia}.`);
});
