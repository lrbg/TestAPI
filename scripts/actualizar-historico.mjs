#!/usr/bin/env node
/**
 * Incorpora el resumen de la ejecucion actual al registro historico.
 *
 * El historico vive en la rama "resultados", separada de la rama principal,
 * para que la acumulacion de mediciones no contamine el historial de cambios
 * del codigo ni dispare ejecuciones nuevas.
 *
 * Uso: node scripts/actualizar-historico.mjs <ruta-del-historico>
 *
 * Trazabilidad: ISO/IEC 20000-1, clausula 9.1, seguimiento y medicion del
 * desempeno del servicio a lo largo del tiempo.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** Numero de ejecuciones conservadas. Alrededor de seis meses de corridas diarias. */
const MAXIMO_EJECUCIONES = 180;

const rutaHistorico = process.argv[2] ?? 'historico/historico.json';
const rutaResumen = process.argv[3] ?? 'resultados/resumen.json';

if (!existsSync(rutaResumen)) {
  console.error(`No se encontró el resumen de ejecución en ${rutaResumen}`);
  process.exit(1);
}

const resumen = JSON.parse(readFileSync(rutaResumen, 'utf8'));

/**
 * Del resumen completo solo se conserva en el historico lo que tiene sentido
 * comparar a lo largo del tiempo. El detalle caso por caso queda en los
 * artefactos de cada ejecucion, que GitHub conserva con su propia politica de
 * retencion.
 */
const entrada = {
  id: resumen.ejecucion.id,
  numero: Number(resumen.ejecucion.numero) || 0,
  fecha: resumen.ejecucion.fecha,
  disparador: resumen.ejecucion.disparador,
  rama: resumen.ejecucion.rama,
  commit: resumen.ejecucion.commit,
  url: resumen.ejecucion.url,
  veredicto: resumen.veredicto,
  funcional: resumen.funcional.disponible
    ? {
        total: resumen.funcional.total,
        aprobadas: resumen.funcional.aprobadas,
        fallidas: resumen.funcional.fallidas,
        omitidas: resumen.funcional.omitidas,
        inestables: resumen.funcional.inestables,
        tasaAprobacion: resumen.funcional.tasaAprobacion,
        duracionMs: resumen.funcional.duracionMs,
        desviaciones: (resumen.funcional.desviaciones ?? []).length,
        casosFallidos: resumen.funcional.casos
          .filter((c) => c.estado === 'fallida')
          .map((c) => ({ id: c.id, titulo: c.titulo })),
      }
    : null,
  desempeno: (resumen.desempeno ?? [])
    .filter((d) => d.disponible)
    .map((d) => ({
      escenario: d.escenario,
      peticiones: d.peticiones,
      tasaFallo: d.tasaFallo,
      mediana: d.duracion.mediana,
      p95: d.duracion.p95,
      p99: d.duracion.p99,
      aprobado: d.aprobado,
    })),
};

let historico = [];
if (existsSync(rutaHistorico)) {
  try {
    const contenido = JSON.parse(readFileSync(rutaHistorico, 'utf8'));
    if (Array.isArray(contenido)) historico = contenido;
  } catch {
    console.warn('El histórico existente no pudo interpretarse y se reconstruye desde cero.');
  }
}

/* Una reejecucion del mismo identificador sustituye a la anterior en lugar de
   duplicarla, de modo que reintentar una corrida no distorsione las series. */
historico = historico.filter((e) => e.id !== entrada.id);
historico.push(entrada);
historico.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

if (historico.length > MAXIMO_EJECUCIONES) {
  historico = historico.slice(historico.length - MAXIMO_EJECUCIONES);
}

mkdirSync(dirname(rutaHistorico), { recursive: true });
writeFileSync(rutaHistorico, JSON.stringify(historico, null, 2));

console.log(
  `Histórico actualizado en ${rutaHistorico}: ${historico.length} ejecuciones registradas.`
);
console.log(`Ejecución incorporada: número ${entrada.numero}, veredicto "${entrada.veredicto}".`);
