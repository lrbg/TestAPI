#!/usr/bin/env node
/**
 * Consolida los resultados de las dos suites en un unico resumen de ejecucion.
 *
 * Entrada:  resultados/playwright.json y resultados/k6-*.json
 * Salida:   resultados/resumen.json
 *
 * El resumen es el unico formato que consumen el reporte historico, el portal
 * publicado y el agente de triaje. Concentrar la normalizacion en un solo
 * lugar evita que cada consumidor interprete los reportes crudos a su manera.
 *
 * Trazabilidad: ISO/IEC/IEEE 29119-3, elementos "Test Execution Log" y
 * "Test Completion Report".
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const DIRECTORIO = 'resultados';

/* ------------------------------------------------------------------ */
/* Contexto de la ejecucion                                            */
/* ------------------------------------------------------------------ */

function contextoDeEjecucion() {
  const disparadores = {
    workflow_dispatch: 'Manual',
    pull_request: 'Solicitud de incorporación',
    schedule: 'Programada',
    push: 'Integración en la rama principal',
  };

  return {
    id: process.env.GITHUB_RUN_ID ?? `local-${Date.now()}`,
    numero: process.env.GITHUB_RUN_NUMBER ?? '0',
    disparador: disparadores[process.env.GITHUB_EVENT_NAME] ?? 'Ejecución local',
    eventoCrudo: process.env.GITHUB_EVENT_NAME ?? 'local',
    rama: process.env.GITHUB_REF_NAME ?? 'desconocida',
    commit: (process.env.GITHUB_SHA ?? '').slice(0, 7),
    autor: process.env.GITHUB_ACTOR ?? 'no informado',
    fecha: new Date().toISOString(),
    url:
      process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
        : null,
  };
}

/* ------------------------------------------------------------------ */
/* Suite funcional                                                     */
/* ------------------------------------------------------------------ */

/** Recorre el arbol de suites del reporte y devuelve una lista plana de casos. */
function recorrerSuites(suites, archivoHeredado = '') {
  const casos = [];

  for (const suite of suites ?? []) {
    const archivo = suite.file ?? archivoHeredado;

    for (const spec of suite.specs ?? []) {
      const prueba = (spec.tests ?? [])[0] ?? {};
      const resultados = prueba.results ?? [];
      const ultimo = resultados[resultados.length - 1] ?? {};

      const identificador = (spec.title.match(/^([A-Z]{3}-[A-Z0-9]+-?\d*)/) ?? [])[1] ?? null;
      const etiquetas = (spec.title.match(/@[\w-]+/g) ?? []).map((e) => e.slice(1));
      const titulo = spec.title.replace(/\s*@[\w-]+/g, '').trim();

      const anotaciones = [
        ...(prueba.annotations ?? []),
        ...(ultimo.annotations ?? []),
      ].map((a) => ({ tipo: a.type, descripcion: a.description ?? '' }));

      casos.push({
        id: identificador,
        titulo,
        suite: suite.title ?? '',
        archivo,
        estado: normalizarEstado(spec, ultimo),
        duracionMs: resultados.reduce((total, r) => total + (r.duration ?? 0), 0),
        reintentos: Math.max(0, resultados.length - 1),
        etiquetas,
        anotaciones,
        error: extraerError(ultimo),
      });
    }

    casos.push(...recorrerSuites(suite.suites, archivo));
  }

  return casos;
}

function normalizarEstado(spec, ultimoResultado) {
  const estado = ultimoResultado.status;
  if (estado === 'skipped') return 'omitida';
  if (spec.ok === true && (ultimoResultado.retry ?? 0) > 0) return 'inestable';
  if (spec.ok === true) return 'aprobada';
  return 'fallida';
}

function extraerError(resultado) {
  const errores = resultado.errors ?? [];
  if (errores.length === 0) return null;

  const texto = errores
    .map((e) => e.message ?? '')
    .join('\n')
    /* Se retira el coloreado de la consola para que el mensaje sea legible
       tanto en el portal como en el cuerpo de un issue. */
    .replace(/\[[0-9;]*m/g, '')
    .trim();

  return texto.slice(0, 4000);
}

function resumirFuncional() {
  const ruta = join(DIRECTORIO, 'playwright.json');
  if (!existsSync(ruta)) {
    return { disponible: false, motivo: 'No se genero el reporte de la suite funcional' };
  }

  const reporte = JSON.parse(readFileSync(ruta, 'utf8'));
  const casos = recorrerSuites(reporte.suites);

  const porEstado = (estado) => casos.filter((c) => c.estado === estado).length;

  const etiquetas = {};
  for (const caso of casos) {
    for (const etiqueta of caso.etiquetas) {
      etiquetas[etiqueta] ??= { total: 0, aprobadas: 0, fallidas: 0 };
      etiquetas[etiqueta].total += 1;
      if (caso.estado === 'aprobada') etiquetas[etiqueta].aprobadas += 1;
      if (caso.estado === 'fallida') etiquetas[etiqueta].fallidas += 1;
    }
  }

  const desviaciones = casos.flatMap((caso) =>
    caso.anotaciones
      .filter((a) => a.tipo === 'desviacion')
      .map((a) => ({ caso: caso.id, titulo: caso.titulo, descripcion: a.descripcion }))
  );

  const mediciones = casos.flatMap((caso) =>
    caso.anotaciones
      .filter((a) => a.tipo === 'medicion')
      .map((a) => ({ caso: caso.id, titulo: caso.titulo, descripcion: a.descripcion }))
  );

  const total = casos.length;
  const aprobadas = porEstado('aprobada');

  return {
    disponible: true,
    total,
    aprobadas,
    fallidas: porEstado('fallida'),
    omitidas: porEstado('omitida'),
    inestables: porEstado('inestable'),
    tasaAprobacion: total > 0 ? Number(((aprobadas / total) * 100).toFixed(1)) : 0,
    duracionMs: Math.round(reporte.stats?.duration ?? casos.reduce((t, c) => t + c.duracionMs, 0)),
    etiquetas,
    desviaciones,
    mediciones,
    casos,
  };
}

/* ------------------------------------------------------------------ */
/* Suite de desempeno                                                  */
/* ------------------------------------------------------------------ */

function metrica(datos, nombre, campo) {
  const valor = datos?.metrics?.[nombre]?.values?.[campo];
  return typeof valor === 'number' ? Number(valor.toFixed(2)) : null;
}

function umbralesIncumplidos(datos) {
  const incumplidos = [];

  for (const [nombre, definicion] of Object.entries(datos?.metrics ?? {})) {
    for (const [expresion, estado] of Object.entries(definicion?.thresholds ?? {})) {
      const falla = typeof estado === 'object' ? estado.ok === false : estado === false;
      if (falla) incumplidos.push(`${nombre}: ${expresion}`);
    }
  }

  return incumplidos;
}

function resumirDesempeno() {
  if (!existsSync(DIRECTORIO)) return [];

  const archivos = readdirSync(DIRECTORIO).filter(
    (a) => a.startsWith('k6-') && a.endsWith('.json')
  );

  return archivos.map((archivo) => {
    const escenario = archivo.replace(/^k6-/, '').replace(/\.json$/, '');

    let datos;
    try {
      datos = JSON.parse(readFileSync(join(DIRECTORIO, archivo), 'utf8'));
    } catch {
      return { escenario, disponible: false, motivo: 'El resumen no pudo interpretarse' };
    }

    const incumplidos = umbralesIncumplidos(datos);

    return {
      escenario,
      disponible: true,
      peticiones: metrica(datos, 'http_reqs', 'count') ?? 0,
      tasaFallo: metrica(datos, 'http_req_failed', 'rate') ?? 0,
      erroresDeNegocio: metrica(datos, 'errores_de_negocio', 'rate') ?? 0,
      peticionesLimitadas: metrica(datos, 'peticiones_limitadas_por_cuota', 'count') ?? 0,
      duracion: {
        media: metrica(datos, 'http_req_duration', 'avg'),
        mediana: metrica(datos, 'http_req_duration', 'med'),
        p95: metrica(datos, 'http_req_duration', 'p(95)'),
        p99: metrica(datos, 'http_req_duration', 'p(99)'),
        maxima: metrica(datos, 'http_req_duration', 'max'),
      },
      porOperacion: {
        imagenes: metrica(datos, 'duracion_busqueda_imagenes', 'p(95)'),
        razas: metrica(datos, 'duracion_busqueda_razas', 'p(95)'),
      },
      umbralesIncumplidos: incumplidos,
      aprobado: incumplidos.length === 0,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Veredicto                                                           */
/* ------------------------------------------------------------------ */

/**
 * Un veredicto de "aprobado" exige que no haya fallos funcionales ni umbrales
 * de desempeno incumplidos. Las desviaciones documentadas degradan el
 * veredicto a "con observaciones" pero no lo rechazan: corresponden a defectos
 * conocidos del servicio bajo prueba, ya registrados y bajo seguimiento.
 */
function calcularVeredicto(funcional, desempeno) {
  const fallosFuncionales = funcional.disponible ? funcional.fallidas : 0;
  const fallosDesempeno = desempeno.filter((d) => d.disponible && !d.aprobado).length;

  if (fallosFuncionales > 0 || fallosDesempeno > 0) return 'rechazado';
  if ((funcional.desviaciones ?? []).length > 0 || (funcional.inestables ?? 0) > 0) {
    return 'con observaciones';
  }
  return 'aprobado';
}

/* ------------------------------------------------------------------ */

function principal() {
  if (!existsSync(DIRECTORIO)) mkdirSync(DIRECTORIO, { recursive: true });

  const funcional = resumirFuncional();
  const desempeno = resumirDesempeno();

  const resumen = {
    version: 1,
    ejecucion: contextoDeEjecucion(),
    funcional,
    desempeno,
    veredicto: calcularVeredicto(funcional, desempeno),
  };

  const destino = join(DIRECTORIO, 'resumen.json');
  writeFileSync(destino, JSON.stringify(resumen, null, 2));

  console.log(`Resumen de ejecución escrito en ${destino}`);
  console.log(`Veredicto: ${resumen.veredicto}`);

  if (funcional.disponible) {
    console.log(
      `Suite funcional: ${funcional.aprobadas} aprobadas, ${funcional.fallidas} fallidas, ` +
        `${funcional.omitidas} omitidas de ${funcional.total} casos ` +
        `(${funcional.tasaAprobacion} por ciento).`
    );
  }

  for (const escenario of desempeno) {
    if (!escenario.disponible) continue;
    console.log(
      `Desempeno ${escenario.escenario}: ${escenario.peticiones} peticiones, ` +
        `percentil 95 en ${escenario.duracion.p95} ms, ` +
        `${escenario.aprobado ? 'umbrales cumplidos' : 'umbrales incumplidos'}.`
    );
  }
}

principal();
