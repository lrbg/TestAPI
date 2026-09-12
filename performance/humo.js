/**
 * Escenario de humo.
 *
 * Proposito: confirmar que el servicio responde correctamente bajo carga
 * minima antes de invertir tiempo en cualquier otro escenario. Si este
 * escenario falla, el resto de las mediciones carece de sentido.
 *
 * Duracion aproximada: 1 minuto. Concurrencia: 1 usuario virtual.
 */

import { sleep } from 'k6';
import { buscarImagenes, buscarRazas, resumenEstandar, terminoParaIteracion } from './lib/comun.js';

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'p(95)', 'p(99)', 'max'],
  scenarios: {
    humo: {
      executor: 'constant-vus',
      vus: 1,
      duration: '1m',
      tags: { escenario: 'humo' },
    },
  },
  thresholds: {
    http_req_failed: ['rate==0'],
    http_req_duration: ['p(95)<1500'],
    errores_de_negocio: ['rate==0'],
  },
};

export default function () {
  buscarImagenes({ limit: 5 });
  sleep(1);

  buscarRazas(terminoParaIteracion(__ITER));
  sleep(1);
}

export function handleSummary(datos) {
  return resumenEstandar('humo', datos);
}
