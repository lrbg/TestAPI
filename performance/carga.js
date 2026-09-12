/**
 * Escenario de carga nominal.
 *
 * Proposito: caracterizar el comportamiento del servicio bajo el volumen de
 * trabajo que se considera habitual, y verificar que los tiempos de respuesta
 * se mantienen dentro del acuerdo de nivel de servicio durante un periodo
 * sostenido.
 *
 * Perfil: rampa de subida de 1 minuto hasta 10 usuarios virtuales, 3 minutos
 * de meseta y rampa de bajada de 1 minuto. La concurrencia es moderada de
 * forma intencional: el sistema bajo prueba es un servicio de terceros.
 *
 * Trazabilidad: ISO/IEC 20000-1, clausula 8.3.3, gestion del nivel de servicio.
 */

import { sleep } from 'k6';
import {
  UMBRALES_COMUNES,
  buscarImagenes,
  buscarRazas,
  resumenEstandar,
  terminoParaIteracion,
} from './lib/comun.js';

const USUARIOS = Number(__ENV.USUARIOS_VIRTUALES || 10);

export const options = {
  scenarios: {
    carga_nominal: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: USUARIOS },
        { duration: '3m', target: USUARIOS },
        { duration: '1m', target: 0 },
      ],
      gracefulRampDown: '30s',
      tags: { escenario: 'carga' },
    },
  },
  thresholds: UMBRALES_COMUNES,
};

/**
 * Mezcla de operaciones representativa del uso real: la busqueda de imagenes
 * es la operacion dominante y la de razas la acompana con menor frecuencia.
 */
export default function () {
  buscarImagenes({ limit: 10 });
  sleep(Math.random() * 2 + 1);

  if (__ITER % 3 === 0) {
    buscarRazas(terminoParaIteracion(__ITER));
    sleep(Math.random() * 2 + 1);
  }

  if (__ITER % 5 === 0) {
    buscarImagenes({ limit: 25, order: 'ASC', page: __ITER % 20 });
    sleep(1);
  }
}

export function handleSummary(datos) {
  return resumenEstandar('carga', datos);
}
