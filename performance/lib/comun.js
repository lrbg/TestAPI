/**
 * Elementos compartidos por los escenarios de desempeno.
 *
 * Consideracion previa y no negociable: el sistema bajo prueba es un servicio
 * de terceros en produccion. Los perfiles de carga definidos aqui son
 * deliberadamente moderados y estan pensados para caracterizar el
 * comportamiento del servicio tal como lo percibe un consumidor, no para
 * agotar su capacidad. Cualquier ejecucion por encima del perfil de carga
 * nominal requiere autorizacion expresa del proveedor del servicio.
 *
 * Trazabilidad: ISO/IEC 25010:2023, caracteristica "Eficiencia de desempeno",
 * subcaracteristicas "Comportamiento temporal" y "Capacidad".
 */

import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

export const URL_BASE = __ENV.URL_BASE_API || 'https://api.thecatapi.com/v1';
export const LLAVE_API = __ENV.CAT_API_KEY || 'DEMO-API-KEY';

export const ENCABEZADOS = {
  'x-api-key': LLAVE_API,
  Accept: 'application/json',
};

/* Metricas propias: separan la salud del servicio del ruido de la herramienta. */
export const erroresDeNegocio = new Rate('errores_de_negocio');
export const respuestasVacias = new Rate('respuestas_vacias');
export const duracionImagenes = new Trend('duracion_busqueda_imagenes', true);
export const duracionRazas = new Trend('duracion_busqueda_razas', true);
export const peticionesLimitadas = new Counter('peticiones_limitadas_por_cuota');

/**
 * Umbrales de aceptacion comunes.
 *
 * Los valores se derivan de la linea base medida durante el relevamiento del
 * servicio: mediana cercana a 170 ms y percentil 95 por debajo de 520 ms en
 * condiciones de uso individual. Los umbrales dejan margen sobre esa linea
 * base para tolerar la variabilidad de una red publica sin dejar de detectar
 * una degradacion real.
 */
export const UMBRALES_COMUNES = {
  http_req_failed: ['rate<0.01'],
  http_req_duration: ['p(95)<1500', 'p(99)<3000'],
  errores_de_negocio: ['rate<0.01'],
  duracion_busqueda_imagenes: ['p(95)<1500'],
  duracion_busqueda_razas: ['p(95)<1500'],
};

/** Ejecuta una busqueda de imagenes y evalua la respuesta. */
export function buscarImagenes(parametros = {}) {
  const consulta = construirConsulta(Object.assign({ limit: 10 }, parametros));
  const respuesta = http.get(`${URL_BASE}/images/search${consulta}`, {
    headers: ENCABEZADOS,
    tags: { operacion: 'busqueda_imagenes' },
  });

  duracionImagenes.add(respuesta.timings.duration);
  registrarLimitacion(respuesta);

  const correcta = check(
    respuesta,
    {
      'la busqueda de imagenes responde con exito': (r) => r.status === 200,
      'la busqueda de imagenes devuelve una coleccion': (r) => esColeccion(r),
      'la coleccion de imagenes no viene vacia': (r) => longitudDeColeccion(r) > 0,
      'cada imagen trae identificador y direccion': (r) => {
        const cuerpo = interpretar(r);
        return Array.isArray(cuerpo) && cuerpo.every((i) => i && i.id && i.url);
      },
    },
    { operacion: 'busqueda_imagenes' }
  );

  erroresDeNegocio.add(!correcta);
  respuestasVacias.add(respuesta.status === 200 && longitudDeColeccion(respuesta) === 0);

  return respuesta;
}

/** Ejecuta una busqueda de razas y evalua la respuesta. */
export function buscarRazas(termino) {
  const respuesta = http.get(
    `${URL_BASE}/breeds/search?q=${encodeURIComponent(termino)}`,
    { headers: ENCABEZADOS, tags: { operacion: 'busqueda_razas' } }
  );

  duracionRazas.add(respuesta.timings.duration);
  registrarLimitacion(respuesta);

  const correcta = check(
    respuesta,
    {
      'la busqueda de razas responde con exito': (r) => r.status === 200,
      'la busqueda de razas devuelve una coleccion': (r) => esColeccion(r),
      'cada raza trae identificador y nombre': (r) => {
        const cuerpo = interpretar(r);
        return Array.isArray(cuerpo) && cuerpo.every((b) => b && b.id && b.name);
      },
    },
    { operacion: 'busqueda_razas' }
  );

  erroresDeNegocio.add(!correcta);

  return respuesta;
}

/** Terminos de busqueda representativos del uso real del catalogo. */
export const TERMINOS = [
  'beng',
  'siam',
  'pers',
  'maine',
  'abys',
  'ragd',
  'sphy',
  'brit',
  'american',
  'a',
];

/** Devuelve un termino de la lista de forma ciclica y predecible. */
export function terminoParaIteracion(indice) {
  return TERMINOS[indice % TERMINOS.length];
}

function construirConsulta(parametros) {
  const partes = Object.keys(parametros)
    .filter((clave) => parametros[clave] !== undefined && parametros[clave] !== null)
    .map((clave) => `${clave}=${encodeURIComponent(parametros[clave])}`);
  return partes.length ? `?${partes.join('&')}` : '';
}

function interpretar(respuesta) {
  try {
    return respuesta.json();
  } catch (error) {
    return null;
  }
}

function esColeccion(respuesta) {
  return Array.isArray(interpretar(respuesta));
}

function longitudDeColeccion(respuesta) {
  const cuerpo = interpretar(respuesta);
  return Array.isArray(cuerpo) ? cuerpo.length : 0;
}

/**
 * Registra las respuestas de limitacion por cuota. Se contabilizan aparte
 * porque no son un fallo del servicio sino una senal de que el perfil de carga
 * excede lo que la credencial en uso tiene permitido.
 */
function registrarLimitacion(respuesta) {
  if (respuesta.status === 429 || respuesta.status === 403) {
    peticionesLimitadas.add(1);
  }
}

/**
 * Construye el resumen de salida en los formatos que consume el resto del
 * flujo: JSON para el reporte historico y texto para la bitacora de ejecucion.
 */
export function resumenEstandar(nombreEscenario, datos) {
  const salida = {};
  salida[`resultados/k6-${nombreEscenario}.json`] = JSON.stringify(datos, null, 2);
  salida.stdout = resumenLegible(nombreEscenario, datos);
  return salida;
}

function resumenLegible(nombreEscenario, datos) {
  const m = datos.metrics || {};
  const valor = (metrica, campo) =>
    m[metrica] && m[metrica].values && m[metrica].values[campo] !== undefined
      ? Number(m[metrica].values[campo]).toFixed(2)
      : 'sin dato';

  const lineas = [
    '',
    `Escenario de desempeno: ${nombreEscenario}`,
    '='.repeat(60),
    `Peticiones totales          ${valor('http_reqs', 'count')}`,
    `Peticiones fallidas         ${valor('http_req_failed', 'rate')}`,
    `Duracion mediana            ${valor('http_req_duration', 'med')} ms`,
    `Duracion percentil 95       ${valor('http_req_duration', 'p(95)')} ms`,
    `Duracion percentil 99       ${valor('http_req_duration', 'p(99)')} ms`,
    `Duracion maxima             ${valor('http_req_duration', 'max')} ms`,
    `Errores de negocio          ${valor('errores_de_negocio', 'rate')}`,
    `Peticiones limitadas        ${valor('peticiones_limitadas_por_cuota', 'count')}`,
    '='.repeat(60),
    '',
  ];

  return lineas.join('\n');
}
