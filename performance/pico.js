/**
 * Escenario de pico.
 *
 * Proposito: verificar como responde el servicio ante un aumento subito de
 * demanda y, sobre todo, si recupera sus tiempos normales una vez que el pico
 * cede. Reproduce la situacion de una campana, una nota de prensa o un
 * reintento masivo de clientes.
 *
 * Perfil: subida brusca a cuatro veces la carga nominal durante un minuto y
 * regreso inmediato al nivel de partida, con una fase de observacion posterior.
 *
 * Requiere ejecucion deliberada.
 */

import { sleep } from 'k6';
import { buscarImagenes, resumenEstandar } from './lib/comun.js';

const USUARIOS_PICO = Number(__ENV.USUARIOS_VIRTUALES || 40);

export const options = {
  scenarios: {
    pico: {
      executor: 'ramping-vus',
      startVUs: 5,
      stages: [
        { duration: '1m', target: 5 },
        { duration: '20s', target: USUARIOS_PICO },
        { duration: '1m', target: USUARIOS_PICO },
        { duration: '20s', target: 5 },
        { duration: '2m', target: 5 },
      ],
      gracefulRampDown: '30s',
      tags: { escenario: 'pico' },
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<5000'],
  },
};

export default function () {
  buscarImagenes({ limit: 10 });
  sleep(1);
}

export function handleSummary(datos) {
  return resumenEstandar('pico', datos);
}
