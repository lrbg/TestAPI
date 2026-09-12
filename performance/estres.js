/**
 * Escenario de estres.
 *
 * Proposito: localizar el punto en el que el servicio deja de sostener el
 * acuerdo de nivel de servicio, y observar como se comporta al superarlo. Un
 * servicio bien construido se degrada de forma ordenada y lo comunica con el
 * codigo de estado adecuado; uno fragil devuelve errores de servidor o deja de
 * responder.
 *
 * Perfil: escalones sucesivos de concurrencia hasta cuatro veces la carga
 * nominal, con recuperacion final.
 *
 * Requiere ejecucion deliberada: no forma parte de la ejecucion programada
 * diaria y solo debe lanzarse con autorizacion del proveedor del servicio.
 */

import { sleep } from 'k6';
import { buscarImagenes, buscarRazas, resumenEstandar, terminoParaIteracion } from './lib/comun.js';

const USUARIOS_MAXIMOS = Number(__ENV.USUARIOS_VIRTUALES || 40);

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'p(95)', 'p(99)', 'max'],
  scenarios: {
    estres: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: Math.round(USUARIOS_MAXIMOS * 0.25) },
        { duration: '2m', target: Math.round(USUARIOS_MAXIMOS * 0.5) },
        { duration: '2m', target: Math.round(USUARIOS_MAXIMOS * 0.75) },
        { duration: '2m', target: USUARIOS_MAXIMOS },
        { duration: '2m', target: 0 },
      ],
      gracefulRampDown: '30s',
      tags: { escenario: 'estres' },
    },
  },
  /**
   * Los umbrales son mas permisivos que en carga nominal de forma deliberada:
   * el objetivo del escenario no es aprobar, sino medir donde se rompe. Lo que
   * no se tolera es la caida del servicio, representada por una tasa de fallo
   * superior al cinco por ciento.
   */
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<5000'],
  },
};

export default function () {
  buscarImagenes({ limit: 10 });
  sleep(0.5);

  if (__ITER % 2 === 0) {
    buscarRazas(terminoParaIteracion(__ITER));
    sleep(0.5);
  }
}

export function handleSummary(datos) {
  return resumenEstandar('estres', datos);
}
