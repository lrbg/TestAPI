/**
 * Genera el documento unico de entrega.
 *
 * Cubre los cinco entregables solicitados y todos sus apartados:
 *   1. Analisis del API
 *   2. Plan de pruebas
 *   3. Casos de prueba, con los ocho campos obligatorios mas la evidencia
 *   4. Priorizacion de pruebas
 *   5. Propuesta de automatizacion
 *
 * Lee los datos de docs/datos/, que son tambien la fuente del portal.
 *
 * Uso: node scripts/generar-documento.cjs
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
const M = convertInchesToTwip(0.6);
const M_H = convertInchesToTwip(0.45);
const ANCHO_V = LETTER.width - M * 2;
const ANCHO_H = LETTER.height - M_H * 2;

const AZUL = '1F5C8B';
const CAB = 'EDEBE6';
const SUAVE = 'F5F4F1';
const ROJO = '9B2C2C';
const AMBAR = '8A5A12';
const VERDE = '2F6B46';
const TENUE = '5C5A54';

const BASE = 'https://api.thecatapi.com/v1';

const p = (t, o = {}) => new Paragraph({
  spacing: { after: o.after ?? 120, line: 268 },
  children: [new TextRun({ text: t, size: o.size ?? 20, bold: o.bold, color: o.color, italics: o.italics })],
});

const h1 = (t) => new Paragraph({
  heading: HeadingLevel.HEADING_1, spacing: { before: 280, after: 150 },
  children: [new TextRun({ text: t, size: 29, bold: true, color: AZUL })],
});

const h2 = (t) => new Paragraph({
  heading: HeadingLevel.HEADING_2, spacing: { before: 250, after: 110 },
  children: [new TextRun({ text: t, size: 23, bold: true })],
});

const h3 = (t) => new Paragraph({
  heading: HeadingLevel.HEADING_3, spacing: { before: 190, after: 90 },
  children: [new TextRun({ text: t, size: 20, bold: true, color: TENUE })],
});

const cod = (t) => new Paragraph({
  spacing: { after: 0, line: 222 },
  children: [new TextRun({ text: t, font: 'Consolas', size: 14 })],
});

const vin = (t) => new Paragraph({
  numbering: { reference: 'v', level: 0 }, spacing: { after: 70, line: 264 },
  children: [new TextRun({ text: t, size: 20 })],
});

const num = (t) => new Paragraph({
  numbering: { reference: 'n', level: 0 }, spacing: { after: 70, line: 264 },
  children: [new TextRun({ text: t, size: 20 })],
});

const esp = (h = 110) => new Paragraph({ spacing: { after: h }, children: [] });
const salto = () => new Paragraph({ children: [new PageBreak()] });

const nota = (tit, txt, color = AZUL) => new Paragraph({
  spacing: { before: 130, after: 170, line: 268 },
  indent: { left: 150 },
  border: { left: { style: BorderStyle.SINGLE, size: 18, color, space: 12 } },
  shading: { type: ShadingType.CLEAR, fill: SUAVE },
  children: [new TextRun({ text: `${tit} `, size: 20, bold: true }), new TextRun({ text: txt, size: 20 })],
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
  margins: { top: 55, bottom: 55, left: 90, right: 90 },
  verticalAlign: 'top',
  children: (Array.isArray(c) ? c : [c]).map((x) => x instanceof Paragraph ? x : new Paragraph({
    spacing: { after: 0, line: 236 },
    children: [new TextRun({ text: String(x), size: o.size ?? 16, bold: o.bold, color: o.color, font: o.font })],
  })),
});

const ajustar = (a, total) => {
  const MIN = 460;
  const b = a.map((x) => Math.max(x, MIN));
  const s = b.reduce((x, y) => x + y, 0);
  const e = b.map((x) => Math.max(MIN, Math.round((x / s) * total)));
  e[e.length - 1] += total - e.reduce((x, y) => x + y, 0);
  return e;
};

const tabla = (cab, filas, anchosProp, total = ANCHO_V, size = 16) => {
  const anchos = ajustar(anchosProp, total);
  return new Table({
    width: { size: total, type: WidthType.DXA }, columnWidths: anchos, borders: BORDES,
    rows: [
      new TableRow({ tableHeader: true, children: cab.map((x, i) => celda(x, { ancho: anchos[i], fondo: CAB, bold: true, size: Math.max(14, size - 1) })) }),
      ...filas.map((f) => new TableRow({ children: f.map((c, i) => celda(c, { ancho: anchos[i], size })) })),
    ],
  });
};

const ficha = (pares, anchoEtq = 2300, total = ANCHO_V) => {
  const a = ajustar([anchoEtq, total - anchoEtq], total);
  return new Table({
    width: { size: total, type: WidthType.DXA }, columnWidths: a, borders: BORDES,
    rows: pares.map(([k, v]) => new TableRow({
      children: [celda(k, { ancho: a[0], fondo: CAB, bold: true, size: 16 }), celda(v, { ancho: a[1], size: 17 })],
    })),
  });
};

/* ------------------------------------------------------------------ */
/* Datos                                                               */
/* ------------------------------------------------------------------ */

const raiz = path.join(__dirname, '..');
const leer = (f) => JSON.parse(fs.readFileSync(path.join(raiz, 'docs/datos', f), 'utf8'));

const CASOS = leer('catalogo.json').casos;
const EV = leer('evidencias.json').casos;
const HALL = leer('hallazgos.json').hallazgos;

const url = (r) => String(r).replace(/^(GET|POST|PUT|DELETE|PATCH|HEAD) \//, `$1 ${BASE}/`);

const partir = (txt, ancho) => {
  const out = [];
  for (const linea of String(txt).split('\n')) {
    let r = linea;
    while (r.length > ancho) {
      let c = r.lastIndexOf('&', ancho);
      if (c < ancho * 0.5) c = r.lastIndexOf(',', ancho);
      if (c < ancho * 0.5) c = r.lastIndexOf(' ', ancho);
      if (c < ancho * 0.5) c = ancho;
      out.push(r.slice(0, c));
      r = r.slice(c);
    }
    out.push(r);
  }
  return out;
};

const conDesv = CASOS.filter((c) => /Hallazgo H-\d+/i.test(c.resultadoReal ?? '')).length;
const peticiones = Object.values(EV).reduce((t, r) => t + r.length, 0);
const cuenta = (pre) => CASOS.filter((c) => c.id.startsWith(pre)).length;
const porTipo = (t) => CASOS.filter((c) => c.tipo === t).length;

/* ------------------------------------------------------------------ */
/* Portada                                                             */
/* ------------------------------------------------------------------ */

const portada = [
  esp(1500),
  new Paragraph({ spacing: { after: 70 }, children: [new TextRun({ text: 'Evaluación Técnica QA', size: 18, bold: true, color: AZUL })] }),
  new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: 'Pruebas de los endpoints de búsqueda', size: 36, bold: true })] }),
  new Paragraph({
    spacing: { after: 360 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: AZUL, space: 8 } },
    children: [new TextRun({ text: 'Análisis, plan de pruebas, casos con evidencia, priorización y automatización', size: 21, color: TENUE })],
  }),

  ficha([
    ['URL base', BASE],
    ['Ejercicio 1', 'GET https://api.thecatapi.com/v1/images/search'],
    ['Ejercicio 2', 'GET https://api.thecatapi.com/v1/breeds/search'],
    ['Autenticación', 'Encabezado x-api-key. El buscador de razas la exige: sin ella responde 403'],
    ['Entorno', 'Producción. No existe entorno de pruebas'],
    ['Especificación', 'https://developers.thecatapi.com/view-account/ylX4blBYT9FaoVd6OhvR?report=FJkYOq9tW'],
  ], 2100),

  esp(200),

  tabla(
    ['Pruebas', 'Correctas', 'Con desviación', 'Peticiones', 'Hallazgos', 'Tiempo mediano'],
    [[String(CASOS.length), String(CASOS.length - conDesv), String(conDesv), String(peticiones), String(HALL.length), '204 ms']],
    [1500, 1500, 1800, 1500, 1400, 1800], ANCHO_V, 18
  ),

  esp(200),

  tabla(
    ['Contenido', 'Dónde'],
    [
      ['1. Análisis del API', 'Ambigüedades, riesgos funcionales y técnicos, dependencias e información requerida'],
      ['2. Plan de pruebas', 'Objetivo, alcance, supuestos, datos, estrategia, escenarios y criterios'],
      ['3. Casos de prueba', `${CASOS.length} casos con sus ocho campos, el status real y la respuesta obtenida`],
      ['4. Priorización', 'Qué ejecutar en dos horas, qué dejar para después y qué riesgos comunicar'],
      ['5. Automatización', 'Qué automatizar, qué dejar manual, con qué herramientas y con qué enfoque'],
    ],
    [2600, ANCHO_V - 2600], ANCHO_V, 17
  ),

  esp(240),
  p('Repositorio: https://github.com/lrbg/TESTAPI   Portal: https://lrbg.github.io/TESTAPI/', { color: TENUE }),
  p('Fecha: ' + new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }), { color: TENUE }),
  salto(),
];

/* ------------------------------------------------------------------ */
/* 1. Analisis del API                                                 */
/* ------------------------------------------------------------------ */

const analisis = [
  h1('1. Análisis del API'),

  p('El enunciado remite a una especificación publicada por el proveedor. Esa página declara siete parámetros con su tipo y valor por defecto, el método de autenticación y el límite para quien consulta sin llave. Contrastarla con el servicio real es el punto de partida de todo el trabajo.'),

  h2('1.1 Los dos endpoints'),

  tabla(
    ['Endpoint', 'Para qué sirve', 'Parámetros según el enunciado'],
    [
      ['GET /images/search', 'Buscar o devolver imágenes aleatorias', 'size, mime_types, format, has_breeds, order, page, limit'],
      ['GET /breeds/search', 'Buscar razas por nombre', 'q, attach_image'],
    ],
    [2200, 2600, ANCHO_V - 4800]
  ),

  esp(140),

  p('Primera diferencia: el enunciado y la especificación no listan los mismos parámetros.'),

  tabla(
    ['Parámetro', 'La especificación', 'El enunciado', 'Funciona'],
    [
      ['limit', 'Si, 1 a 100, por defecto 1', 'Si', 'Si'],
      ['page', 'Si, 0 en adelante', 'Si', 'Si'],
      ['order', 'Si, ASC, DESC o RAND', 'Si', 'Si'],
      ['has_breeds', 'Si, 1 o 0', 'Si', 'Si'],
      ['breed_ids', 'Si', 'No', 'Si'],
      ['category_ids', 'Si', 'No', 'No'],
      ['sub_id', 'Si', 'No', 'No'],
      ['size', 'No', 'Si', 'No'],
      ['mime_types', 'No', 'Si', 'No'],
      ['format', 'No', 'Si', 'No'],
    ],
    [1800, 2600, 1600, ANCHO_V - 6000]
  ),

  esp(140),

  nota('Consecuencia.', 'Siguiendo solo el enunciado se prueban funciones que no existen y se deja sin probar breed_ids, el único filtro que si opera. Antes de cerrar el alcance hay que acordar cual de las dos fuentes manda. Es el hallazgo H-17.', ROJO),

  h2('1.2 Dudas y ambigüedades detectadas'),

  p('Puntos que impiden decidir si un comportamiento es correcto. Cada uno necesita respuesta del equipo del servicio.'),

  tabla(
    ['Clave', 'Qué falta', 'Por qué importa'],
    [
      ['A-01', 'El enunciado no menciona la autenticación. La especificación si.', 'Sin llave el buscador de razas responde 403. Falta acordar con que llave y con que plan se ejecutan las pruebas: de eso dependen el límite de consumo y los campos que llegan.'],
      ['A-02', 'No se declaran los valores válidos de size, mime_types ni format.', 'Sin saber que valor es válido no hay prueba negativa posible. El servicio los acepta todos y no los aplica, así que tampoco se deducen probando.'],
      ['A-03', 'No se dice que pasa cuando limit o page salen de rango.', 'Los valores límite son el objeto de las pruebas de borde. El comportamiento real se dedujo de los mensajes de error.'],
      ['A-04', 'No se precisa cuando llegan los encabezados de paginación.', 'Quien los lea siempre obtendrá valores nulos en la mayoría de las llamadas y no sabrá si es un fallo.'],
      ['A-05', 'No se define que hace attach_image.', 'El comportamiento observado contradice la lectura natural del enunciado.'],
      ['A-06', 'No se define que devolver cuando no hay coincidencias.', 'Lista vacía con 200 y error 404 son dos diseños válidos y opuestos.'],
      ['A-07', 'No hay contrato de error ni catálogo de códigos.', 'Sin el no se puede verificar que los fallos se comuniquen de forma útil.'],
      ['A-08', 'No se declara la política de límites de consumo.', 'Define el perfil máximo de la prueba de carga y explica buena parte de los fallos intermitentes.'],
      ['A-09', 'No se declara política de versiones.', 'Sin ella no se distingue un cambio anunciado de una ruptura del contrato.'],
      ['A-10', 'No se declara el acuerdo de nivel de servicio.', 'Los umbrales de tiempo de este plan son una estimación basada en una medición propia.'],
    ],
    [800, 3200, ANCHO_V - 4000]
  ),

  salto(),

  h2('1.3 Riesgos funcionales identificados'),

  tabla(
    ['Clave', 'Riesgo', 'Prob.', 'Impacto', 'Cómo se cubre'],
    [
      ['RF-01', 'Los filtros no se aplican y el cliente recibe datos que cree filtrados.', 'Alta', 'Alto', 'Casos que revisan el contenido devuelto, no solo el código de estado.'],
      ['RF-02', 'La paginación pierde o repite imágenes.', 'Media', 'Alto', 'Comparar identificadores entre páginas seguidas y probar la última página.'],
      ['RF-03', 'El orden aleatorio no opera y una caché devuelve siempre lo mismo.', 'Media', 'Medio', 'Lecturas repetidas comprobando que cambian.'],
      ['RF-04', 'La búsqueda pierde coincidencias por mayúsculas, acentos o espacios.', 'Media', 'Medio', 'Casos con variantes de escritura y nombres compuestos.'],
      ['RF-05', 'No encontrar nada se comunica como error.', 'Baja', 'Medio', 'Caso con una búsqueda sin resultados.'],
      ['RF-06', 'Un valor límite se acepta pero no se atiende.', 'Alta', 'Alto', 'Probar los dos extremos de cada rango comparando lo pedido con lo entregado.'],
    ],
    [800, 3100, 800, 900, ANCHO_V - 5600]
  ),

  esp(200),

  h2('1.4 Riesgos técnicos identificados'),

  tabla(
    ['Clave', 'Riesgo', 'Prob.', 'Impacto', 'Cómo se cubre'],
    [
      ['RT-01', 'El azar hace inestable cualquier comparación de igualdad.', 'Alta', 'Alto', 'Ninguna prueba espera una imagen concreta. Se comprueba forma y cantidad.'],
      ['RT-02', 'Un 429 o un 403 por cuota se confunde con un fallo del servicio.', 'Alta', 'Medio', 'Métrica aparte que cuenta las respuestas por límite de cuota.'],
      ['RT-03', 'La red pública produce fallos que no son defectos.', 'Alta', 'Medio', 'Un reintento, umbrales con margen y percentiles en vez de máximos.'],
      ['RT-04', 'La respuesta cambia sin aviso y rompe a los clientes.', 'Media', 'Alto', 'Validación por esquema en cada corrida.'],
      ['RT-05', 'No hay entorno de pruebas: todo impacta producción.', 'Alta', 'Alto', 'Volumen bajo y carga alta fuera del flujo automático.'],
      ['RT-06', 'La llave caduca y la suite falla en bloque.', 'Media', 'Alto', 'Comprobación de la llave antes de ejecutar y casos que distinguen un 403 de un fallo funcional.'],
      ['RT-07', 'Una caché devuelve respuestas viejas y esconde una regresión.', 'Media', 'Medio', 'Comprobar que las respuestas aleatorias cambian.'],
      ['RT-08', 'Las imágenes vienen de otro dominio con su propia disponibilidad.', 'Media', 'Bajo', 'Se verifica la dirección, no se descarga el archivo.'],
    ],
    [800, 3100, 800, 900, ANCHO_V - 5600]
  ),

  salto(),

  h2('1.5 Dependencias externas y restricciones'),

  tabla(
    ['Dependencia', 'Qué implica'],
    [
      ['Servicio de otra empresa, en producción', 'No hay entorno de pruebas ni control de los datos. Todo se prueba desde fuera sobre un sistema vivo.'],
      ['Llave obligatoria para el buscador de razas', 'Sin llave el ejercicio 2 no se puede ejecutar. La suite usa la llave pública de demostración y admite una propia por secreto.'],
      ['Datos que cambian', 'El catálogo de imágenes cambia. El de razas es estable, por eso se usa como dato de referencia.'],
      ['Red pública', 'Los tiempos medidos incluyen latencia que no es del servicio. Se compensa con percentiles y margen.'],
      ['Capa de caché y distribución', 'Una respuesta servida desde caché no mide el servicio de origen.'],
      ['Autorización del proveedor', 'La carga alta y las pruebas de intrusión sobre un servicio ajeno necesitan permiso escrito. Sin el, quedan fuera de alcance.'],
      ['Cuota compartida de la llave de demostración', 'Sus límites son impredecibles porque la usan muchos. Conviene una llave propia.'],
    ],
    [3400, ANCHO_V - 3400]
  ),

  esp(200),

  h2('1.6 Información requerida antes de ejecutar pruebas'),

  tabla(
    ['Clave', 'Qué se pide', 'Qué desbloquea'],
    [
      ['I-01', 'Contrato formal del API, a ser posible en OpenAPI.', 'Pruebas de contrato concluyentes'],
      ['I-02', 'Método de autenticación, plan aplicable y una llave para pruebas.', 'Ejercicio 2 completo'],
      ['I-03', 'Valores válidos de size, mime_types y format.', 'Pruebas negativas de esos parámetros'],
      ['I-04', 'Condición exacta de los encabezados de paginación.', 'Verificación de la paginación'],
      ['I-05', 'Efecto esperado de attach_image.', 'Cierre del hallazgo H-01'],
      ['I-06', 'Política de límites: cuota, ventana y código al superarla.', 'Diseño del perfil de carga'],
      ['I-07', 'Acuerdo de nivel de servicio comprometido.', 'Criterios de aceptación de tiempos'],
      ['I-08', 'Política de versiones y de cambios incompatibles.', 'Estrategia de regresión'],
      ['I-09', 'Entorno de pruebas o ventana autorizada para carga alta.', 'Escenarios de estrés, pico y resistencia'],
      ['I-10', 'Si el recorte a 10 sin llave es decisión de producto o defecto.', 'Clasificación del hallazgo H-02'],
      ['I-11', 'Si breed_ids, category_ids y sub_id entran en el alcance.', 'Cierre del hallazgo H-17'],
    ],
    [800, ANCHO_V - 4200, 3400]
  ),

  salto(),

  h2('1.7 Resultado del análisis: los hallazgos'),

  p(`Diferencias comprobadas entre lo que debería pasar y lo que pasa. Cada una tiene un caso que la reproduce.`),

  tabla(
    ['Clave', 'Sev.', 'Qué pasa', 'Impacto', 'Caso'],
    HALL.map((h) => [h.clave, h.severidad, h.titulo + '.', h.impacto, h.caso]),
    [700, 800, 2600, ANCHO_V - 6100, 1300]
  ),

  esp(200),

  h3('Los seis de severidad alta, con su evidencia'),

  ...HALL.filter((h) => h.severidad === 'Alta').flatMap((h) => [
    new Paragraph({
      spacing: { before: 200, after: 80 }, keepNext: true,
      children: [
        new TextRun({ text: h.clave, size: 20, bold: true, color: AZUL, font: 'Consolas' }),
        new TextRun({ text: `   ${h.titulo}`, size: 20, bold: true }),
      ],
    }),
    ficha([
      ['Qué debería pasar', h.dice],
      ['Qué pasa de verdad', h.hace],
      ['Evidencia', String(h.evidencia).split('\n').map(cod)],
      ['A quien le duele', h.impacto],
      ['Caso', h.caso],
    ], 2100),
  ]),

  salto(),
];

/* ------------------------------------------------------------------ */
/* 2. Plan de pruebas                                                  */
/* ------------------------------------------------------------------ */

const plan = [
  h1('2. Plan de pruebas'),

  h2('2.1 Objetivo del plan'),

  p('Determinar si los dos endpoints:'),
  vin('Hacen lo que dice su especificación.'),
  vin('Responden de forma predecible ante entradas inválidas y valores límite.'),
  vin('Mantienen una forma de respuesta estable.'),
  vin('Responden lo bastante rápido y están disponibles para uso en producción.'),
  p('Y dejar por escrito lo que la especificación no define, para que el equipo del servicio lo cierre.'),

  h2('2.2 Alcance'),

  vin('Los dos endpoints indicados, versión 1, en producción.'),
  vin('Todos los parámetros: los siete del enunciado y los tres que solo declara la especificación.'),
  vin('Los dos modos de consumo: con llave y sin ella.'),
  vin('Escenarios funcionales, negativos, de borde y de forma de la respuesta.'),
  vin('Códigos de estado, encabezados, tipo de contenido y estructura del cuerpo.'),
  vin('Tiempos de respuesta y disponibilidad con carga de humo y carga nominal.'),
  vin('Control de acceso, entradas hostiles y fuga de información.'),
  vin('Calidad de los mensajes de error.'),

  h2('2.3 Fuera de alcance'),

  tabla(
    ['Qué queda fuera', 'Por qué'],
    [
      ['El resto de endpoints del servicio', 'El requerimiento delimita dos.'],
      ['Operaciones de escritura: subir, votar, favoritos', 'Fuera del requerimiento y con efectos sobre datos de terceros.'],
      ['Pruebas de intrusión', 'Necesitan permiso escrito del proveedor.'],
      ['Carga alta dentro del flujo automático', 'Mismo motivo. Los escenarios existen y se lanzan a mano.'],
      ['Descargar y verificar el contenido de las imágenes', 'Vienen de otro dominio. Se verifica la dirección, no el archivo.'],
      ['La web del proveedor', 'El requerimiento se limita al API.'],
      ['Compatibilidad entre versiones', 'No hay política de versiones. Depende de I-08.'],
      ['Accesibilidad, mantenibilidad y portabilidad', 'No aplican a un API de otra empresa.'],
    ],
    [3800, ANCHO_V - 3800]
  ),

  h2('2.4 Supuestos'),

  num('El servicio está disponible durante la ventana de ejecución. Si el proveedor cae, la corrida es inválida, no es un fallo del producto.'),
  num('La llave configurada es válida y su cuota alcanza para el volumen previsto.'),
  num('La latencia entre el agente de ejecución y el servicio se mantiene dentro del margen de los umbrales.'),
  num('El catálogo de razas es estable y sus identificadores no cambian.'),
  num('El catálogo de imágenes cambia, así que ninguna prueba depende de una imagen concreta.'),
  num('Las reglas deducidas de los mensajes de error siguen vigentes mientras no haya contrato formal.'),
  num('La hora de la corrida diaria corresponde a la Ciudad de México, que no aplica horario de verano.'),

  salto(),

  h2('2.5 Datos de prueba'),

  p('No se pueden crear datos. Se usa lo que no cambia y se evita depender de lo que si.'),

  tabla(
    ['Conjunto', 'Valores', 'Para qué'],
    [
      ['Razas de referencia', 'beng (Bengal), siam (Siamese), mcoo (Maine Coon), abys (Abyssinian)', 'Comprobar contenido concreto'],
      ['Límites de limit', '0, 1, 10, 25, 50, 100, 101 y el texto abc', 'Valores frontera y clases de equivalencia'],
      ['Límites de q', 'vacío, 1, 30 y 31 caracteres, nombre con espacio', 'Frontera de longitud'],
      ['Valores de order', 'ASC, DESC, RANDOM, RAND, minúsculas y un valor inválido', 'Dominio cerrado'],
      ['Identificadores de raza', 'beng, "beng,abys" y uno inexistente', 'Filtro breed_ids'],
      ['Cargas hostiles', 'Inyección SQL, comodín, etiqueta de script, rutas de escape', 'Seguridad'],
      ['Términos para carga', 'Diez términos recorridos en ciclo', 'Evitar que la caché distorsione la medición'],
      ['Credenciales', 'Válida, inválida, vacía, en blanco, ausente y en la URL', 'Control de acceso'],
    ],
    [2300, 4000, ANCHO_V - 6300]
  ),

  esp(130),

  nota('Credenciales.', 'En el repositorio no hay ninguna llave. Se lee de un secreto al ejecutar y, si no existe, se usa la llave pública de demostración del proveedor.'),

  h2('2.6 Estrategia de pruebas'),

  h3('Enfoque general'),
  p('Se prueba desde fuera, sin ver el código, y se empieza por lo que más daño haría si fallara. Cada caso nace de un riesgo del capítulo 1, y cada riesgo tiene al menos un caso. La columna de riesgo del capítulo 3 permite comprobarlo.'),

  h3('Tipos de prueba'),

  tabla(
    ['Tipo', 'Casos', 'Qué verifica', 'Técnica', 'Herramienta'],
    [
      ['Funcional', String(porTipo('Funcional')), 'Lo declarado con entradas válidas', 'Clases de equivalencia', 'Playwright'],
      ['Negativo', String(porTipo('Negativo')), 'El rechazo de lo inválido, con mensaje útil', 'Clases inválidas', 'Playwright'],
      ['Borde', String(porTipo('Borde')), 'Los valores límite de cada rango', 'Valores frontera', 'Playwright'],
      ['Contrato', String(porTipo('Contrato')), 'La forma de la respuesta en sus dos variantes', 'Validación por esquema', 'Playwright y Ajv'],
      ['Seguridad', String(porTipo('Seguridad')), 'Acceso, entradas hostiles y fuga de datos', 'Casos de abuso', 'Playwright'],
      ['No funcional', String(porTipo('No funcional')), 'Tiempos, compresión, caché y disponibilidad', 'Series cortas de medición', 'Playwright'],
      ['Carga', '5 escenarios', 'Comportamiento bajo demanda sostenida', 'Perfiles de carga', 'k6'],
    ],
    [1700, 800, 3400, 2200, ANCHO_V - 8100]
  ),

  esp(160),

  h3('Cuatro decisiones que condicionan toda la suite'),

  num('Ninguna prueba espera una imagen concreta. El endpoint devuelve imágenes al azar, así que se comprueba la forma, la cantidad y que no haya repetidas.'),
  num('Cada caso guarda su evidencia: petición, código, encabezados, tiempo y respuesta. Va en el capítulo 3.'),
  num('Cuando un defecto ya está documentado, la prueba comprueba lo que el servicio hace de verdad y deja anotada la diferencia. Así la suite sigue en verde y el defecto sigue a la vista. Si lo corrigen, la prueba falla y avisa.'),
  num('La carga se mantiene baja. Los escenarios que pueden afectar al servicio existen, pero no corren solos.'),

  salto(),

  h2('2.7 Escenarios'),

  h3('Funcionales'),
  vin('Búsqueda sin parámetros y con limit en varios valores.'),
  vin('Campos obligatorios de cada imagen y de cada raza.'),
  vin('Que no se repitan imágenes dentro de la misma respuesta.'),
  vin('Que el orden aleatorio devuelva resultados distintos.'),
  vin('Filtro por raza asociada y filtro por identificador de raza.'),
  vin('Páginas seguidas sin repetir y orden fijo estable entre lecturas.'),
  vin('Encabezados de paginación.'),
  vin('Búsqueda de razas exacta, parcial, con espacio y en distintas grafias.'),
  vin('Imagen asociada a la raza y consulta de una imagen por su identificador.'),

  h3('Negativos'),
  vin('limit igual a cero, negativo, con letras y por encima del máximo.'),
  vin('page negativo.'),
  vin('order fuera del conjunto permitido.'),
  vin('Término de búsqueda vacío y término demasiado largo.'),
  vin('Identificador de raza inexistente.'),
  vin('Método no permitido sobre un recurso de solo lectura.'),
  vin('Ruta que no existe.'),
  vin('Acceso sin llave, con llave falsa, vacía y en blanco.'),

  h3('De borde'),
  vin('Los dos extremos de cada rango, en el límite y un paso fuera.'),
  vin('Longitud mínima y máxima del término de búsqueda.'),
  vin('Página más alla del último resultado y última página calculada con el total.'),
  vin('Valores inventados en parámetros sin dominio declarado.'),
  vin('Parámetros que el servicio no conoce.'),
  vin('Lista vacía como resultado válido.'),
  vin('La misma petición con llave y sin ella.'),

  h2('2.8 Validaciones técnicas'),

  tabla(
    ['Qué se válida', 'Cómo'],
    [
      ['Código de estado', 'El que corresponde a cada tipo de resultado: 200, 400, 403 o 404'],
      ['Encabezados', 'Content-Type, los tres de paginación, Content-Encoding, Access-Control-Allow-Origin y ETag'],
      ['Estructura JSON', 'Validación por esquema de la imagen en sus dos variantes, de la raza y del cuerpo de error'],
      ['Contenido del cuerpo', 'Cantidad de elementos, identificadores sin repetir, cumplimiento real de cada filtro'],
      ['Mensajes de error', 'Que nombren la regla incumplida y no filtren detalles internos'],
      ['Transporte', 'Que la petición y las direcciones devueltas usen https'],
      ['Tiempos', 'Mediana y percentil 95 sobre series de 10 y 20 peticiones'],
    ],
    [2800, ANCHO_V - 2800]
  ),

  salto(),

  h2('2.9 Criterios de aceptación'),

  p('Una corrida se aprueba cuando se cumplen las diez condiciones.'),

  tabla(
    ['Clave', 'Criterio', 'Umbral'],
    [
      ['CA-01', 'Casos críticos que pasan', '100 por ciento'],
      ['CA-02', 'Casos totales que pasan', 'No menos del 98 por ciento'],
      ['CA-03', 'Defectos de severidad alta abiertos sin analizar', 'Ninguno'],
      ['CA-04', 'Mediana del tiempo de respuesta', 'Menos de 1500 ms'],
      ['CA-05', 'Percentil 95 en carga nominal', 'Menos de 1500 ms'],
      ['CA-06', 'Percentil 99', 'Menos de 3000 ms'],
      ['CA-07', 'Peticiones fallidas en carga nominal', 'Menos del 1 por ciento'],
      ['CA-08', 'Disponibilidad en series sostenidas', 'No menos del 95 por ciento'],
      ['CA-09', 'Cambios de forma de la respuesta sin documentar', 'Ninguno'],
      ['CA-10', 'Casos de seguridad que pasan', '100 por ciento'],
    ],
    [900, ANCHO_V - 4700, 3800]
  ),

  esp(140),

  p('Los tiempos salen de la medición del capítulo 3: mediana de 204 ms y máximo de 320 ms en 20 lecturas. El margen cubre la variación de la red. Si el proveedor pública sus compromisos, estos valores se sustituyen.'),

  h2('2.10 Criterios de salida'),

  p('El ciclo se cierra cuando se cumplen las siete condiciones.'),

  num('Todos los casos se ejecutaron, o su omisión está justificada y registrada.'),
  num('Se cumplen los criterios CA-01 a CA-10, o su incumplimiento lo aceptó por escrito el responsable del producto.'),
  num('Todo defecto de severidad alta está corregido y verificado, o tiene una decisión documentada de aplazamiento con su riesgo.'),
  num('Los defectos de severidad media y baja están registrados, clasificados y planificados.'),
  num('Los puntos A-01 a A-10 tienen respuesta, o consta la decisión de continuar sin ella.'),
  num('El informe de cierre está publicado con la cobertura, los defectos abiertos y los riesgos que quedan.'),
  num('La suite lleva al menos tres corridas programadas seguidas sin fallos ajenos al producto.'),

  salto(),
];

/* ------------------------------------------------------------------ */
/* 3. Casos de prueba                                                  */
/* ------------------------------------------------------------------ */

const estado = (c) => [`esperado ${c.statusEsperado ?? ''}`, `real ${c.statusReal ?? ''}`];

const evidenciaDe = (c) => {
  const regs = EV[c.id] ?? [];
  const out = [];
  for (const r of regs) {
    out.push(...partir(`${r.st}${r.ms !== undefined ? `  ${r.ms} ms` : ''}${r.n !== undefined && r.n !== null ? `  ${r.n} elem` : ''}`, 44).map(cod));
    if (r.hdr) {
      for (const [k, v] of Object.entries(r.hdr).filter(([k]) => /pagination|encoding|allow/.test(k))) {
        out.push(...partir(`${k}: ${v}`, 44).map(cod));
      }
    }
    if (r.body) out.push(...partir(String(r.body).slice(0, 200), 44).map(cod));
    if (r.medicion) out.push(...partir(r.medicion, 44).map(cod));
    out.push(cod(''));
  }
  return out.length ? out : [cod('sin evidencia')];
};

const entradaDe = (c) => {
  const regs = EV[c.id] ?? [];
  const lineas = [];
  if (regs.length) {
    for (const r of regs) {
      const q = String(r.req).split('?')[1];
      lineas.push(...partir(q ? `?${q}` : 'sin parámetros', 30).map(cod));
    }
  }
  lineas.push(cod(''));
  lineas.push(...partir(`Llave: ${c.auth ?? 'con llave'}`, 34).map(cod));
  return lineas;
};

const fila = (c) => {
  const desv = String(c.resultadoReal ?? '').match(/Hallazgo (H-\d+)/i);
  return [
    c.id,
    c.endpoint,
    c.objetivo,
    entradaDe(c),
    c.esperado,
    c.validaciones.map((v) => `- ${v}`),
    c.prioridad,
    c.tipo,
    estado(c),
    evidenciaDe(c),
    [new Paragraph({
      spacing: { after: 0 },
      children: (desv ? ['Desviación', desv[1]] : ['Correcto']).map((l, i) =>
        new TextRun({ text: l, size: 14, bold: true, color: desv ? AMBAR : VERDE, break: i ? 1 : 0 })),
    })],
  ];
};

const CABEZAL = ['ID', 'Endpoint', 'Objetivo', 'Parámetros de entrada', 'Resultado esperado', 'Validaciones', 'Prior.', 'Tipo', 'Status', 'Respuesta real', 'Veredicto'];
const ANCHOS = [600, 1080, 1620, 1250, 1820, 1680, 560, 740, 700, 2450, 900];

const GRUPOS = [
  { t: '3.1 Ejercicio 1. Búsqueda de imágenes: camino principal', pre: 'IMG-F' },
  { t: '3.2 Ejercicio 1. Búsqueda de imágenes: entradas inválidas', pre: 'IMG-N' },
  { t: '3.3 Ejercicio 1. Búsqueda de imágenes: valores límite', pre: 'IMG-B' },
  { t: '3.4 Ejercicio 1. Parámetros que declara la especificación', pre: 'ESP' },
  { t: '3.5 Ejercicio 2. Búsqueda de razas: camino principal', pre: 'BRD-F' },
  { t: '3.6 Ejercicio 2. Búsqueda de razas: entradas inválidas y límites', pre: 'BRD-N' },
  { t: '3.7 Forma de la respuesta', pre: 'CTR' },
  { t: '3.8 Seguridad', pre: 'SEG' },
  { t: '3.9 Tiempos y disponibilidad', pre: 'NFN' },
];

const casos = [
  h1('3. Casos de prueba'),

  p(`Los ${CASOS.length} casos con los ocho campos que pide el entregable, más el código de estado real y la respuesta que devolvió el servicio.`),

  tabla(
    ['Grupo', 'Casos', 'Qué cubre'],
    GRUPOS.map((g) => [g.pre, String(cuenta(g.pre)), g.t.replace(/^3\.\d+ /, '')]),
    [1200, 800, ANCHO_H - 2000], ANCHO_H, 16
  ),

  esp(160),

  p('Los últimos tres campos no los pide el entregable, pero permiten comprobar cada caso sin volver a ejecutarlo: el status esperado frente al real, la respuesta obtenida y si hubo diferencia.'),

  ...GRUPOS.flatMap((g) => {
    const lista = CASOS.filter((c) => c.id.startsWith(g.pre));
    if (!lista.length) return [];
    return [salto(), h2(g.t), tabla(CABEZAL, lista.map(fila), ANCHOS, ANCHO_H, 14)];
  }),

  salto(),
];

/* ------------------------------------------------------------------ */
/* 4. Priorizacion                                                     */
/* ------------------------------------------------------------------ */

const priorizacion = [
  h1('4. Priorización de pruebas'),

  h2('4.1 Qué ejecutar primero con dos horas'),

  p('Los casos críticos, unos 40 minutos. Responden a cuatro preguntas: el servicio devuelve datos, con la forma acordada, rechaza lo inválido y no deja pasar a quien no tiene llave.'),

  tabla(
    ['Bloque', 'Casos', 'Por qué va primero'],
    [
      ['Camino principal', 'IMG-F-01 a IMG-F-03, BRD-F-01, BRD-F-02, BRD-F-06', 'Si falla esto, lo demás no importa.'],
      ['Forma de la respuesta', 'CTR-01 a CTR-05', 'Un cambio aquí rompe a todos los clientes a la vez.'],
      ['Control de acceso', 'SEG-01 a SEG-04, SEG-08, SEG-09', 'Un fallo aquí no se aplaza.'],
      ['Filtro que si funciona', 'ESP-01', 'Es el único filtro operativo del endpoint.'],
      ['Entradas inválidas', 'IMG-N-01, IMG-N-04, IMG-N-06, BRD-N-01, BRD-N-02', 'Si lo inválido se acepta, el cliente recibe datos que cree filtrados.'],
      ['Valores límite de más riesgo', 'IMG-B-01 a IMG-B-03, BRD-N-04', 'Los límites concentran la mayoría de los defectos.'],
      ['Paginación', 'IMG-F-08, IMG-F-10', 'Perder datos sin aviso es el peor modo de fallo.'],
      ['Tiempos y disponibilidad', 'NFN-01, NFN-02, NFN-07 y el humo de carga', 'Detecta una caída grave en pocos minutos.'],
    ],
    [2400, 3600, ANCHO_V - 6000]
  ),

  esp(180),

  h2('4.2 Qué dejar para una segunda fase'),

  tabla(
    ['Bloque', 'Casos'],
    [
      ['Resto de valores límite', 'IMG-B-04 a IMG-B-11'],
      ['Variantes de escritura y coincidencias parciales', 'BRD-F-03 a BRD-F-05, BRD-F-09, BRD-F-10'],
      ['Filtros que no funcionan', 'ESP-04, ESP-05, ESP-10'],
      ['Seguridad de menor severidad', 'SEG-05, SEG-05b, SEG-06, SEG-07, SEG-10'],
      ['No funcionales complementarios', 'NFN-03 a NFN-06, NFN-08'],
      ['Carga nominal', 'Escenario de k6, cinco minutos'],
      ['Carga alta', 'Estrés, pico y resistencia, con autorización del proveedor'],
    ],
    [4000, ANCHO_V - 4000]
  ),

  esp(180),

  h2('4.3 Escenarios críticos para un release'),

  p('Un fallo en cualquiera de estos cinco puntos detiene la liberación.'),

  tabla(
    ['Escenario', 'Por qué detiene la liberación'],
    [
      ['El control de acceso cede', 'Si el recurso protegido responde sin llave válida, deja de ser un problema de calidad y pasa a ser de seguridad.'],
      ['La forma de la respuesta cambia sin aviso', 'Desaparece un campo o cambia un tipo. Rompe a todos los clientes a la vez y sin síntoma previo.'],
      ['La paginación pierde o repite imágenes', 'El cliente pierde datos y nadie lo nota hasta que el dato hace falta.'],
      ['La validación de entradas se relaja', 'Lo inválido empieza a aceptarse y el cliente recibe resultados que cree filtrados.'],
      ['El tiempo de respuesta supera el acuerdo', 'Un percentil 95 por encima del umbral en carga nominal anticipa una caída en producción.'],
    ],
    [3400, ANCHO_V - 3400]
  ),

  esp(180),

  h2('4.4 Riesgos que comunicaría al equipo'),

  tabla(
    ['Riesgo', 'A quién', 'Qué le dirías'],
    [
      ['El enunciado no coincide con la especificación', 'Producto y QA', 'Se están probando funciones que no existen y se deja fuera el único filtro que opera. Hay que decidir cual fuente manda antes de cerrar el alcance.'],
      ['Sin llave llegan 10 imágenes aunque se pidan más', 'Producto y arquitectura', 'El recorte está documentado, pero el mensaje de error dice que el máximo es 100 y nada avisa del recorte. Corregir el mensaje o añadir un encabezado.'],
      ['La llave admitida en la URL', 'Seguridad', 'Esta documentado, pero deja la credencial en registros, historial y proxies. Recomendar siempre el encabezado.'],
      ['Los filtros que no filtran', 'Desarrollo', 'mime_types, sub_id, category_ids y attach_image se aceptan y se ignoran. Cualquier función construida sobre ellos parte de un supuesto falso.'],
      ['La respuesta cambia según la llave', 'Arquitectura y documentación', 'Obliga a cada cliente a saber su modo de autenticación para saber que campos esperar. Documentarlo o unificarlo.'],
      ['No hay entorno de pruebas', 'Gestión', 'Toda verificación gasta cuota de producción. Limita volumen, frecuencia y tipo de prueba.'],
      ['Dependencia de un proveedor externo', 'Gestión y operación', 'No hay control sobre disponibilidad, cambios ni cuotas. Definir que hace el producto cuando el proveedor no responde.'],
    ],
    [3000, 2200, ANCHO_V - 5200]
  ),

  salto(),
];

/* ------------------------------------------------------------------ */
/* 5. Automatizacion                                                   */
/* ------------------------------------------------------------------ */

const automatizacion = [
  h1('5. Propuesta de automatización'),

  h2('5.1 Qué pruebas automatizar'),

  tabla(
    ['Conjunto', 'Por qué', 'Cuándo corre'],
    [
      ['Camino principal', 'Se repite en cada ciclo y su resultado es objetivo', 'Cada PR y a diario'],
      ['Negativos y valores límite', 'Son muchos, mecánicos y fáciles de olvidar a mano', 'Cada PR y a diario'],
      ['Forma de la respuesta', 'Detecta una ruptura antes que los clientes', 'Cada PR y a diario'],
      ['Control de acceso y entradas hostiles', 'Una regresión aquí es inaceptable', 'Cada PR y a diario'],
      ['Humo de carga', 'Detecta una caída grave en un minuto', 'A diario'],
      ['Carga nominal', 'Verifica el acuerdo de nivel de servicio', 'A diario y antes de liberar'],
      ['Estrés, pico y resistencia', 'Duran mucho e impactan un servicio ajeno', 'A demanda, con autorización'],
    ],
    [3000, 4000, ANCHO_V - 7000]
  ),

  esp(180),

  h2('5.2 Qué dejar manual'),

  tabla(
    ['Actividad', 'Por qué no se automatiza'],
    [
      ['Explorar un endpoint nuevo o modificado', 'Automatizar antes de entender produce pruebas que verifican una suposición equivocada.'],
      ['Valorar si un mensaje de error es útil', 'Se puede comprobar que existe. Que se entienda requiere juicio.'],
      ['Contrastar documentación contra comportamiento', 'Detectar una ambigüedad es lectura crítica, no ejecución. Así salieron los hallazgos H-15 y H-17.'],
      ['Pruebas de intrusión', 'Necesitan autorización, herramientas especializadas y criterio humano.'],
      ['Primera verificación de un defecto corregido', 'Conviene hacerla a mano. Después se incorpora como caso de regresión.'],
    ],
    [3600, ANCHO_V - 3600]
  ),

  esp(180),

  h2('5.3 Herramientas sugeridas'),

  tabla(
    ['Herramienta', 'Para qué', 'Por qué esta'],
    [
      ['Playwright', 'Suite funcional, negativa, de borde, contrato y seguridad', 'Su contexto de peticiones prueba APIs sin navegador. Trae reporte navegable, adjuntos de evidencia, reintentos y trazas. Sirve también si más adelante hay que cubrir una interfaz.'],
      ['Ajv con esquemas JSON', 'Validación de la forma de la respuesta', 'El contrato queda escrito como dato, no como código, y sirve además de documentación.'],
      ['k6', 'Escenarios de carga', 'Los escenarios se escriben en JavaScript, los umbrales son parte del script y el resultado es un dato estructurado que se integra sin conversión manual.'],
      ['GitHub Actions', 'Orquestación de las tres formas de ejecución', 'Vive junto al código, no añade infraestructura y cubre manual, PR y programada.'],
      ['GitHub Pages', 'Publicación del portal y del histórico', 'El resultado deja de estar dentro de una bitácora y pasa a ser consultable por cualquiera.'],
      ['Postman y Newman', 'No se adoptaron', 'La colección en JSON es difícil de revisar en un cambio y las aserciones quedan dispersas. Para explorar a mano siguen siendo comodos; para una suite versionada, no.'],
    ],
    [2000, 2800, ANCHO_V - 4800]
  ),

  esp(180),

  h2('5.4 Enfoque de automatización'),

  tabla(
    ['Nivel', 'Contenido', 'Duración', 'Cuándo corre'],
    [
      ['Humo', 'Casos críticos de ambos endpoints', 'Menos de 2 min', 'Al inicio de toda corrida'],
      ['Regresión funcional', 'Los 87 casos', 'De 4 a 6 min', 'Cada PR y cada corrida programada'],
      ['Contrato', 'Esquemas de las dos variantes y del error', 'Menos de 1 min', 'Dentro de la regresión y por separado'],
      ['Carga continua', 'Humo y carga nominal', 'De 6 a 7 min', 'Cada corrida programada'],
      ['Carga a demanda', 'Estrés, pico y resistencia', 'De 9 a 30 min', 'Manual, con autorización'],
    ],
    [2200, 4200, 1700, ANCHO_V - 8100]
  ),

  esp(140),

  p('Abajo van las pruebas de contrato: rapidas y detectan el fallo más caro. Encima, los casos funcionales y de límites. Arriba, la carga larga, que solo corre si alguien la pide.'),

  h2('5.5 El flujo implementado'),

  p('La propuesta está construida. El repositorio tiene la suite, los escenarios de carga, la integración continua y el portal.'),

  tabla(
    ['Cómo se dispara', 'Qué ejecuta', 'Qué produce'],
    [
      ['Manual, desde la pestaña de acciones', 'Lo que elijas: conjunto de pruebas y escenario de carga', 'Pública el portal y actualiza el histórico si se marca'],
      ['Solicitud de incorporación a la rama principal', 'Los 87 casos y el humo de carga', 'Comentario con el resultado en la propia solicitud'],
      ['Diaria a las 16:00 de la Ciudad de México', 'Los 87 casos, humo y carga nominal', 'Actualiza el histórico, ejecuta el triaje de incidencias y pública el portal'],
    ],
    [3200, 3600, ANCHO_V - 6800]
  ),

  esp(140),

  h3('El agente de triaje'),

  tabla(
    ['Situación', 'Qué hace'],
    [
      ['Fallo nuevo', 'Abre una incidencia con evidencia, severidad y pasos para reproducirlo'],
      ['Fallo que ya tiene incidencia', 'Comenta la reaparición, sin duplicar'],
      ['El caso vuelve a pasar', 'Comenta y cierra la incidencia'],
      ['Umbral de carga incumplido', 'Abre una incidencia con las mediciones del escenario'],
    ],
    [3400, ANCHO_V - 3400]
  ),

  esp(140),

  p('Lo que alguien escriba o etiquete a mano se conserva. El agente no pisa el trabajo de una persona.'),

  esp(240),

  p('Fin del documento.', { color: TENUE, italics: true }),
];

/* ------------------------------------------------------------------ */

const encabezado = new Header({
  children: [new Paragraph({
    alignment: AlignmentType.RIGHT, spacing: { after: 50 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'DEDCD6', space: 5 } },
    children: [new TextRun({ text: 'Evaluación técnica QA. api.thecatapi.com/v1', size: 14, color: TENUE })],
  })],
});

const pie = new Footer({
  children: [new Paragraph({
    alignment: AlignmentType.RIGHT,
    children: [
      new TextRun({ text: 'Página ', size: 14, color: TENUE }),
      new TextRun({ children: [PageNumber.CURRENT], size: 14, color: TENUE }),
      new TextRun({ text: ' de ', size: 14, color: TENUE }),
      new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 14, color: TENUE }),
    ],
  })],
});

const vert = { page: { size: { width: LETTER.width, height: LETTER.height }, margin: { top: M, bottom: M, left: M, right: M } } };
const horiz = { page: { size: { width: LETTER.width, height: LETTER.height, orientation: PageOrientation.LANDSCAPE }, margin: { top: M_H, bottom: M_H, left: M_H, right: M_H } } };

const doc = new Document({
  creator: 'lrbg',
  title: 'Evaluación técnica QA: endpoints de búsqueda de imágenes y razas',
  description: 'Análisis del API, plan de pruebas, casos con evidencia, priorización y propuesta de automatización',
  numbering: {
    config: [
      { reference: 'v', levels: [{ level: 0, format: 'bullet', text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 380, hanging: 210 } } } }] },
      { reference: 'n', levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 410, hanging: 240 } } } }] },
    ],
  },
  styles: { default: { document: { run: { font: 'Calibri', size: 20 } } } },
  sections: [
    { properties: vert, children: portada },
    { properties: vert, headers: { default: encabezado }, footers: { default: pie }, children: [...analisis, ...plan] },
    { properties: horiz, headers: { default: encabezado }, footers: { default: pie }, children: casos },
    { properties: vert, headers: { default: encabezado }, footers: { default: pie }, children: [...priorizacion, ...automatizacion] },
  ],
});

const salida = path.join(raiz, 'entregables', 'Evaluacion-QA-API.docx');
fs.mkdirSync(path.dirname(salida), { recursive: true });
Packer.toBuffer(doc).then((b) => {
  fs.writeFileSync(salida, b);
  console.log(`Documento generado: ${salida}`);
  console.log(`5 entregables. ${CASOS.length} casos con sus 8 campos, status real y evidencia.`);
});
