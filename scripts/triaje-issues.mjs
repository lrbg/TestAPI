#!/usr/bin/env node
/**
 * Agente de triaje.
 *
 * Interpreta el resumen de la ejecucion y mantiene sincronizado el tablero de
 * incidencias del repositorio: abre una incidencia por cada fallo nuevo,
 * acumula las reapariciones sobre la incidencia existente en lugar de
 * duplicarla, y cierra por si mismo aquellas cuyo caso ha vuelto a pasar.
 *
 * El criterio de identidad es una huella estable derivada del identificador
 * del caso. Gracias a ella un fallo intermitente no genera una incidencia por
 * ejecucion, sino una sola con su historial de reapariciones.
 *
 * Uso: node scripts/triaje-issues.mjs [--simulacion]
 *
 * Trazabilidad: ISO/IEC 20000-1, clausula 8.6.1, gestion de incidencias;
 * ISO/IEC/IEEE 29119-3, elemento "Test Incident Report".
 */

import { readFileSync, existsSync } from 'node:fs';

const SIMULACION = process.argv.includes('--simulacion');
const TOKEN = process.env.GITHUB_TOKEN;
const REPOSITORIO = process.env.GITHUB_REPOSITORY;
const API = process.env.GITHUB_API_URL ?? 'https://api.github.com';

const ETIQUETA_BASE = 'deteccion-automatica';
const MARCA_INICIO = '<!-- huella:';
const MARCA_FIN = '-->';

if (!SIMULACION && (!TOKEN || !REPOSITORIO)) {
  console.error(
    'Faltan GITHUB_TOKEN o GITHUB_REPOSITORY. Use --simulacion para una ejecucion en seco.'
  );
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* Acceso a la interfaz de incidencias                                 */
/* ------------------------------------------------------------------ */

async function peticion(ruta, opciones = {}) {
  if (SIMULACION) {
    console.log(`[simulacion] ${opciones.method ?? 'GET'} ${ruta}`);
    return opciones.method && opciones.method !== 'GET' ? {} : [];
  }

  const respuesta = await fetch(`${API}${ruta}`, {
    ...opciones,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(opciones.headers ?? {}),
    },
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text();
    throw new Error(`${opciones.method ?? 'GET'} ${ruta} respondio ${respuesta.status}: ${detalle}`);
  }

  return respuesta.status === 204 ? {} : respuesta.json();
}

const listarAbiertas = () =>
  peticion(`/repos/${REPOSITORIO}/issues?state=open&labels=${ETIQUETA_BASE}&per_page=100`);

const crear = (cuerpo) =>
  peticion(`/repos/${REPOSITORIO}/issues`, { method: 'POST', body: JSON.stringify(cuerpo) });

const comentar = (numero, texto) =>
  peticion(`/repos/${REPOSITORIO}/issues/${numero}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body: texto }),
  });

const cerrar = (numero) =>
  peticion(`/repos/${REPOSITORIO}/issues/${numero}`, {
    method: 'PATCH',
    body: JSON.stringify({ state: 'closed', state_reason: 'completed' }),
  });

/* ------------------------------------------------------------------ */
/* Clasificacion                                                       */
/* ------------------------------------------------------------------ */

/**
 * La severidad se deriva de la naturaleza del caso, no de quien lo reporta.
 * Un fallo en un caso critico o de seguridad detiene un despliegue; uno en un
 * caso de borde se atiende en la siguiente iteracion.
 */
function clasificar(caso) {
  const etiquetas = caso.etiquetas ?? [];

  if (etiquetas.includes('seguridad')) {
    return { severidad: 'alta', area: 'seguridad', razon: 'Afecta el control de acceso o el tratamiento de entradas hostiles' };
  }
  if (etiquetas.includes('critico') && etiquetas.includes('contrato')) {
    return { severidad: 'alta', area: 'contrato', razon: 'Rompe el contrato de respuesta y afecta a todos los consumidores' };
  }
  if (etiquetas.includes('critico')) {
    return { severidad: 'alta', area: 'funcional', razon: 'Compromete una capacidad esencial del servicio' };
  }
  if (etiquetas.includes('contrato')) {
    return { severidad: 'media', area: 'contrato', razon: 'Desviacion de contrato en un escenario no critico' };
  }
  if (etiquetas.includes('no-funcional')) {
    return { severidad: 'media', area: 'desempeno', razon: 'Degradacion de un atributo no funcional' };
  }
  if (etiquetas.includes('borde')) {
    return { severidad: 'baja', area: 'borde', razon: 'Comportamiento en una condicion frontera' };
  }
  return { severidad: 'media', area: 'funcional', razon: 'Desviacion del comportamiento esperado' };
}

const huellaDeCaso = (caso) => `caso:${caso.id ?? caso.titulo.slice(0, 60)}`;
const huellaDeEscenario = (escenario) => `desempeno:${escenario.escenario}`;

function extraerHuella(cuerpo) {
  const inicio = (cuerpo ?? '').indexOf(MARCA_INICIO);
  if (inicio === -1) return null;
  const fin = cuerpo.indexOf(MARCA_FIN, inicio);
  if (fin === -1) return null;
  return cuerpo.slice(inicio + MARCA_INICIO.length, fin).trim();
}

/* ------------------------------------------------------------------ */
/* Redaccion de incidencias                                            */
/* ------------------------------------------------------------------ */

function cuerpoDeCaso(caso, clasificacion, ejecucion) {
  const anotaciones = (caso.anotaciones ?? [])
    .map((a) => `- ${a.tipo}: ${a.descripcion}`)
    .join('\n');

  return [
    `${MARCA_INICIO} ${huellaDeCaso(caso)} ${MARCA_FIN}`,
    '',
    '## Resumen',
    '',
    `El caso **${caso.id ?? 'sin identificador'}** fallo durante la ejecucion ` +
      `numero ${ejecucion.numero} (${ejecucion.disparador.toLowerCase()}).`,
    '',
    '## Caso afectado',
    '',
    `| Campo | Valor |`,
    `| --- | --- |`,
    `| Identificador | ${caso.id ?? 'sin identificador'} |`,
    `| Titulo | ${caso.titulo} |`,
    `| Archivo | \`${caso.archivo}\` |`,
    `| Tipo de prueba | ${(caso.etiquetas ?? []).join(', ') || 'sin clasificar'} |`,
    `| Severidad asignada | ${clasificacion.severidad} |`,
    `| Area | ${clasificacion.area} |`,
    `| Duracion | ${caso.duracionMs} ms |`,
    `| Reintentos | ${caso.reintentos} |`,
    '',
    `Criterio de severidad: ${clasificacion.razon}.`,
    '',
    '## Evidencia',
    '',
    '```text',
    (caso.error ?? 'La ejecucion no registro un mensaje de error.').slice(0, 3000),
    '```',
    '',
    anotaciones ? `## Anotaciones registradas\n\n${anotaciones}\n` : '',
    '## Contexto de la ejecucion',
    '',
    `- Rama: \`${ejecucion.rama}\``,
    `- Revision: \`${ejecucion.commit}\``,
    `- Fecha: ${ejecucion.fecha}`,
    ejecucion.url ? `- Bitacora completa: ${ejecucion.url}` : '',
    '',
    '## Como reproducir',
    '',
    '```bash',
    'npm ci',
    `npx playwright test --grep "${(caso.id ?? caso.titulo).replace(/"/g, '')}"`,
    '```',
    '',
    '---',
    '',
    'Esta incidencia se mantiene de forma automatica a partir de los resultados de la suite. ' +
      'Se cerrara sola en cuanto el caso vuelva a pasar. Los comentarios y las etiquetas ' +
      'anadidas manualmente se conservan.',
  ]
    .filter((linea) => linea !== '')
    .join('\n');
}

function cuerpoDeDesempeno(escenario, ejecucion) {
  return [
    `${MARCA_INICIO} ${huellaDeEscenario(escenario)} ${MARCA_FIN}`,
    '',
    '## Resumen',
    '',
    `El escenario de desempeno **${escenario.escenario}** incumplio sus umbrales de aceptacion ` +
      `durante la ejecucion numero ${ejecucion.numero}.`,
    '',
    '## Umbrales incumplidos',
    '',
    ...escenario.umbralesIncumplidos.map((u) => `- \`${u}\``),
    '',
    '## Mediciones registradas',
    '',
    '| Metrica | Valor |',
    '| --- | --- |',
    `| Peticiones ejecutadas | ${escenario.peticiones} |`,
    `| Tasa de fallo | ${escenario.tasaFallo} |`,
    `| Errores de negocio | ${escenario.erroresDeNegocio} |`,
    `| Duracion mediana | ${escenario.duracion.mediana} ms |`,
    `| Percentil 95 | ${escenario.duracion.p95} ms |`,
    `| Percentil 99 | ${escenario.duracion.p99} ms |`,
    `| Duracion maxima | ${escenario.duracion.maxima} ms |`,
    `| Peticiones limitadas por cuota | ${escenario.peticionesLimitadas} |`,
    '',
    '## Contexto de la ejecucion',
    '',
    `- Rama: \`${ejecucion.rama}\``,
    `- Revision: \`${ejecucion.commit}\``,
    `- Fecha: ${ejecucion.fecha}`,
    ejecucion.url ? `- Bitacora completa: ${ejecucion.url}` : '',
    '',
    '## Como reproducir',
    '',
    '```bash',
    `k6 run performance/${escenario.escenario}.js`,
    '```',
    '',
    '---',
    '',
    'Antes de escalar la incidencia conviene descartar dos causas externas frecuentes: ' +
      'una limitacion de cuota de la credencial en uso y la variabilidad de red del agente de ' +
      'ejecucion. El contador de peticiones limitadas de la tabla anterior ayuda a distinguirlas.',
  ]
    .filter((linea) => linea !== '')
    .join('\n');
}

const etiquetasDe = (clasificacion) => [
  ETIQUETA_BASE,
  `severidad-${clasificacion.severidad}`,
  `area-${clasificacion.area}`,
];

/* ------------------------------------------------------------------ */
/* Proceso                                                             */
/* ------------------------------------------------------------------ */

async function principal() {
  const ruta = 'resultados/resumen.json';
  if (!existsSync(ruta)) {
    console.error(`No se encontro ${ruta}. Ejecute antes la consolidacion de resultados.`);
    process.exit(1);
  }

  const resumen = JSON.parse(readFileSync(ruta, 'utf8'));
  const { ejecucion } = resumen;

  const fallosFuncionales = (resumen.funcional?.casos ?? []).filter((c) => c.estado === 'fallida');
  const fallosDesempeno = (resumen.desempeno ?? []).filter((d) => d.disponible && !d.aprobado);

  const abiertas = await listarAbiertas();
  const porHuella = new Map();
  for (const incidencia of abiertas) {
    const huella = extraerHuella(incidencia.body);
    if (huella) porHuella.set(huella, incidencia);
  }

  const huellasActivas = new Set();
  let creadas = 0;
  let reincidentes = 0;
  let cerradas = 0;

  /* Fallos funcionales */
  for (const caso of fallosFuncionales) {
    const huella = huellaDeCaso(caso);
    huellasActivas.add(huella);

    const clasificacion = clasificar(caso);
    const existente = porHuella.get(huella);

    if (existente) {
      await comentar(
        existente.number,
        [
          `El fallo se reprodujo en la ejecucion numero ${ejecucion.numero} ` +
            `(${ejecucion.disparador.toLowerCase()}, revision \`${ejecucion.commit}\`).`,
          '',
          '```text',
          (caso.error ?? 'Sin mensaje de error registrado.').slice(0, 2000),
          '```',
          ejecucion.url ? `\nBitacora: ${ejecucion.url}` : '',
        ].join('\n')
      );
      reincidentes += 1;
      console.log(`Reaparicion registrada en la incidencia #${existente.number} (${huella}).`);
    } else {
      const titulo = `[${clasificacion.severidad.toUpperCase()}] ${caso.id ?? 'Caso'}: ${caso.titulo}`;
      const nueva = await crear({
        title: titulo.slice(0, 240),
        body: cuerpoDeCaso(caso, clasificacion, ejecucion),
        labels: etiquetasDe(clasificacion),
      });
      creadas += 1;
      console.log(`Incidencia creada${nueva.number ? ` #${nueva.number}` : ''}: ${titulo}`);
    }
  }

  /* Umbrales de desempeno */
  for (const escenario of fallosDesempeno) {
    const huella = huellaDeEscenario(escenario);
    huellasActivas.add(huella);

    const existente = porHuella.get(huella);
    const clasificacion = { severidad: 'media', area: 'desempeno', razon: 'Umbral de desempeno incumplido' };

    if (existente) {
      await comentar(
        existente.number,
        `El escenario volvio a incumplir sus umbrales en la ejecucion numero ${ejecucion.numero}. ` +
          `Percentil 95 medido: ${escenario.duracion.p95} ms. Tasa de fallo: ${escenario.tasaFallo}.`
      );
      reincidentes += 1;
    } else {
      const titulo = `[MEDIA] Desempeno: el escenario ${escenario.escenario} incumplio sus umbrales`;
      await crear({
        title: titulo,
        body: cuerpoDeDesempeno(escenario, ejecucion),
        labels: etiquetasDe(clasificacion),
      });
      creadas += 1;
      console.log(`Incidencia de desempeno creada: ${titulo}`);
    }
  }

  /* Cierre de lo ya resuelto */
  for (const [huella, incidencia] of porHuella) {
    if (huellasActivas.has(huella)) continue;

    await comentar(
      incidencia.number,
      `El caso asociado volvio a pasar en la ejecucion numero ${ejecucion.numero} ` +
        `(revision \`${ejecucion.commit}\`). La incidencia se cierra de forma automatica. ` +
        'Si vuelve a fallar, se reabrira una nueva con el historial de esta.' +
        (ejecucion.url ? `\n\nBitacora: ${ejecucion.url}` : '')
    );
    await cerrar(incidencia.number);
    cerradas += 1;
    console.log(`Incidencia #${incidencia.number} cerrada (${huella}).`);
  }

  console.log('');
  console.log('Resultado del triaje');
  console.log(`  Incidencias creadas:      ${creadas}`);
  console.log(`  Reapariciones anotadas:   ${reincidentes}`);
  console.log(`  Incidencias cerradas:     ${cerradas}`);
  console.log(`  Fallos funcionales:       ${fallosFuncionales.length}`);
  console.log(`  Umbrales incumplidos:     ${fallosDesempeno.length}`);
}

principal().catch((error) => {
  console.error(`El triaje no pudo completarse: ${error.message}`);
  process.exit(1);
});
