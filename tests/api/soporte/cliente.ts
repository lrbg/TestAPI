/**
 * Cliente de pruebas sobre el contexto de peticiones de Playwright.
 *
 * Cada llamada queda registrada como evidencia adjunta al reporte: peticion,
 * codigo de estado, encabezados relevantes, tiempo de respuesta y un extracto
 * del cuerpo. Esto permite que el reporte responda por si mismo que devolvio
 * el servicio en cada caso, sin tener que reproducir la ejecucion.
 *
 * Trazabilidad: ISO/IEC/IEEE 29119-3, elemento "Test Execution Log".
 */

import { expect, type APIRequestContext, type TestInfo } from '@playwright/test';
import { ENCABEZADOS_ANONIMOS, ENCABEZADOS_AUTENTICADOS, URL_BASE } from './entorno';

export interface RespuestaMedida {
  /** Codigo de estado HTTP devuelto. */
  estado: number;
  /** Tiempo transcurrido entre el envio y la recepcion, en milisegundos. */
  duracionMs: number;
  /** Encabezados de la respuesta en minusculas. */
  encabezados: Record<string, string>;
  /** Cuerpo interpretado como JSON, o null si no era JSON valido. */
  cuerpo: any;
  /** Cuerpo sin interpretar, util para diagnosticar respuestas no JSON. */
  texto: string;
  /** URL efectivamente solicitada. */
  url: string;
}

interface OpcionesLlamada {
  /** Envia la llave de API. Por defecto true. */
  autenticado?: boolean;
  /** Encabezados adicionales o de reemplazo. */
  encabezados?: Record<string, string>;
  /** Metodo HTTP. Por defecto GET. */
  metodo?: 'get' | 'post' | 'put' | 'delete' | 'patch' | 'head';
  /** Etiqueta descriptiva que encabeza la evidencia adjunta. */
  etiqueta?: string;
}

/** Construye una cadena de consulta omitiendo los valores no definidos. */
export function consulta(parametros: Record<string, string | number | undefined>): string {
  const partes = Object.entries(parametros)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return partes.length ? `?${partes.join('&')}` : '';
}

/**
 * Ejecuta una peticion, la mide y adjunta la evidencia al reporte.
 */
export async function llamar(
  peticion: APIRequestContext,
  info: TestInfo,
  ruta: string,
  opciones: OpcionesLlamada = {}
): Promise<RespuestaMedida> {
  const { autenticado = true, encabezados = {}, metodo = 'get', etiqueta } = opciones;

  const url = ruta.startsWith('http') ? ruta : `${URL_BASE}${ruta}`;
  const cabeceras = {
    ...(autenticado ? ENCABEZADOS_AUTENTICADOS : ENCABEZADOS_ANONIMOS),
    ...encabezados,
  };

  const inicio = Date.now();
  const respuesta = await peticion[metodo](url, { headers: cabeceras, failOnStatusCode: false });
  const duracionMs = Date.now() - inicio;

  const texto = await respuesta.text();
  let cuerpo: any = null;
  try {
    cuerpo = texto ? JSON.parse(texto) : null;
  } catch {
    cuerpo = null;
  }

  const encabezadosRespuesta = respuesta.headers();

  const medida: RespuestaMedida = {
    estado: respuesta.status(),
    duracionMs,
    encabezados: encabezadosRespuesta,
    cuerpo,
    texto,
    url,
  };

  await adjuntarEvidencia(info, medida, {
    etiqueta: etiqueta ?? `${metodo.toUpperCase()} ${ruta}`,
    autenticado,
  });

  return medida;
}

/** Adjunta al reporte el detalle completo de una llamada. */
async function adjuntarEvidencia(
  info: TestInfo,
  medida: RespuestaMedida,
  contexto: { etiqueta: string; autenticado: boolean }
): Promise<void> {
  const interesantes = [
    'content-type',
    'pagination-count',
    'pagination-page',
    'pagination-limit',
    'access-control-allow-origin',
    'cf-cache-status',
    'etag',
  ];

  const encabezadosFiltrados = Object.fromEntries(
    interesantes
      .filter((clave) => medida.encabezados[clave] !== undefined)
      .map((clave) => [clave, medida.encabezados[clave]])
  );

  const cuerpoResumido = resumirCuerpo(medida.cuerpo ?? medida.texto);

  const evidencia = [
    `Caso: ${contexto.etiqueta}`,
    `Autenticacion: ${contexto.autenticado ? 'con llave de API' : 'anonima'}`,
    `Peticion: ${medida.url}`,
    `Codigo de estado: ${medida.estado}`,
    `Tiempo de respuesta: ${medida.duracionMs} ms`,
    `Encabezados relevantes: ${JSON.stringify(encabezadosFiltrados, null, 2)}`,
    `Respuesta: ${cuerpoResumido}`,
  ].join('\n');

  await info.attach(`respuesta-${contexto.etiqueta.replace(/[^a-zA-Z0-9]+/g, '-')}`, {
    body: evidencia,
    contentType: 'text/plain',
  });
}

/**
 * Reduce un cuerpo extenso a una muestra legible: conserva la forma completa
 * cuando es pequeno y, cuando es una coleccion grande, muestra el primer
 * elemento y el conteo total.
 */
function resumirCuerpo(cuerpo: unknown): string {
  if (cuerpo === null || cuerpo === undefined) return '(vacia)';
  if (typeof cuerpo === 'string') return cuerpo.slice(0, 1000);
  if (Array.isArray(cuerpo)) {
    if (cuerpo.length === 0) return '[] (coleccion vacia)';
    if (cuerpo.length <= 3) return JSON.stringify(cuerpo, null, 2).slice(0, 2000);
    return [
      `Coleccion de ${cuerpo.length} elementos. Primer elemento:`,
      JSON.stringify(cuerpo[0], null, 2).slice(0, 1500),
    ].join('\n');
  }
  return JSON.stringify(cuerpo, null, 2).slice(0, 2000);
}

/**
 * Verifica que la respuesta sea una coleccion JSON correcta con codigo 200.
 * Agrupa las tres comprobaciones que toda respuesta exitosa debe satisfacer.
 */
export function esperarColeccionValida(medida: RespuestaMedida): any[] {
  expect(medida.estado, `Se esperaba 200 y se recibio ${medida.estado}`).toBe(200);
  expect(
    medida.encabezados['content-type'],
    'El servicio debe declarar contenido JSON'
  ).toContain('application/json');
  expect(Array.isArray(medida.cuerpo), 'El cuerpo debe ser una coleccion JSON').toBe(true);
  return medida.cuerpo as any[];
}

/** Verifica que la respuesta sea un error del servicio con el codigo esperado. */
export function esperarError(medida: RespuestaMedida, estadoEsperado: number): any {
  expect(
    medida.estado,
    `Se esperaba ${estadoEsperado} y se recibio ${medida.estado}`
  ).toBe(estadoEsperado);
  expect(medida.cuerpo, 'El error debe traer un cuerpo JSON descriptivo').not.toBeNull();
  expect(medida.cuerpo.statusCode).toBe(estadoEsperado);
  return medida.cuerpo;
}

/** Normaliza el campo message, que el servicio entrega como cadena o arreglo. */
export function mensajesDeError(cuerpo: any): string[] {
  if (!cuerpo || cuerpo.message === undefined) return [];
  return Array.isArray(cuerpo.message) ? cuerpo.message : [String(cuerpo.message)];
}
