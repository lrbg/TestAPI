/**
 * Escenario de resistencia.
 *
 * Proposito: detectar degradaciones que solo se manifiestan con el paso del
 * tiempo: fugas de memoria, agotamiento de conexiones, saturacion de cache o
 * acumulacion de cuotas. Una carga baja y constante durante un periodo
 * prolongado revela lo que una prueba corta no puede mostrar.
 *
 * Perfil: concurrencia baja y constante durante treinta minutos.
 *
 * Requiere ejecucion deliberada.
 */

import { sleep } from 'k6';
import { buscarImagenes, buscarRazas, resumenEstandar, terminoParaIteracion } from './lib/comun.js';

const DURACION = __ENV.DURACION || '30m';
const USUARIOS = Number(__ENV.USUARIOS_VIRTUALES || 5);

export const options = {
  scenarios: {
    resistencia: {
      executor: 'constant-vus',
      vus: USUARIOS,
      duration: DURACION,
      tags: { escenario: 'resistencia' },
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<2000'],
    errores_de_negocio: ['rate<0.01'],
  },
};

export default function () {
  buscarImagenes({ limit: 10 });
  sleep(2);

  buscarRazas(terminoParaIteracion(__ITER));
  sleep(2);
}

export function handleSummary(datos) {
  return resumenEstandar('resistencia', datos);
}
