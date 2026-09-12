#!/usr/bin/env node
/**
 * Ensambla el sitio que se publica en GitHub Pages.
 *
 * Toma las paginas estaticas del directorio docs, les incorpora los datos de
 * la ejecucion mas reciente y el registro historico acumulado, y adjunta el
 * reporte navegable de la suite funcional.
 *
 * Uso: node scripts/generar-sitio.mjs [ruta-del-historico]
 */

import { cpSync, existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const ORIGEN = 'docs';
const DESTINO = 'sitio';
const rutaHistorico = process.argv[2] ?? 'historico/historico.json';

/* 1. Paginas estaticas */

if (!existsSync(ORIGEN)) {
  console.error(`No se encontro el directorio de origen ${ORIGEN}.`);
  process.exit(1);
}

cpSync(ORIGEN, DESTINO, { recursive: true });
mkdirSync(join(DESTINO, 'datos'), { recursive: true });
console.log(`Paginas estaticas copiadas de ${ORIGEN} a ${DESTINO}.`);

/* 2. Registro historico */

let historico = [];
if (existsSync(rutaHistorico)) {
  try {
    const contenido = JSON.parse(readFileSync(rutaHistorico, 'utf8'));
    if (Array.isArray(contenido)) historico = contenido;
  } catch {
    console.warn('El registro historico no pudo interpretarse; se publica vacio.');
  }
}
writeFileSync(join(DESTINO, 'datos', 'historico.json'), JSON.stringify(historico, null, 2));
console.log(`Registro historico publicado con ${historico.length} ejecuciones.`);

/* 3. Resumen de la ejecucion mas reciente */

if (existsSync('resultados/resumen.json')) {
  copyFileSync('resultados/resumen.json', join(DESTINO, 'datos', 'resumen.json'));
  console.log('Resumen de la ultima ejecucion publicado.');
} else if (historico.length > 0) {
  /* Si esta corrida no produjo resumen, se conserva visible el ultimo conocido
     para que el portal no aparezca vacio. */
  const ultima = historico[historico.length - 1];
  writeFileSync(
    join(DESTINO, 'datos', 'resumen.json'),
    JSON.stringify(
      {
        version: 1,
        ejecucion: {
          id: ultima.id,
          numero: ultima.numero,
          disparador: ultima.disparador,
          rama: ultima.rama,
          commit: ultima.commit,
          fecha: ultima.fecha,
          url: ultima.url,
        },
        funcional: ultima.funcional
          ? { disponible: true, ...ultima.funcional, desviaciones: [] }
          : { disponible: false },
        desempeno: (ultima.desempeno ?? []).map((d) => ({
          escenario: d.escenario,
          disponible: true,
          duracion: { mediana: d.mediana, p95: d.p95, p99: d.p99 },
          aprobado: d.aprobado,
        })),
        veredicto: ultima.veredicto,
      },
      null,
      2
    )
  );
  console.log('Sin resumen de esta corrida: se reutiliza el ultimo registrado en el historico.');
} else {
  console.log('Sin resumen de ejecucion disponible.');
}

/* 4. Reporte navegable de la suite funcional */

if (existsSync('resultados/playwright-html')) {
  cpSync('resultados/playwright-html', join(DESTINO, 'reporte-funcional'), { recursive: true });
  console.log('Reporte navegable de la suite funcional incorporado.');
} else {
  mkdirSync(join(DESTINO, 'reporte-funcional'), { recursive: true });
  writeFileSync(
    join(DESTINO, 'reporte-funcional', 'index.html'),
    `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reporte no disponible</title><link rel="stylesheet" href="../activos/estilos.css"></head>
<body><main><h1>Reporte no disponible</h1>
<p class="entradilla">Esta publicacion no incluye el reporte navegable de la suite funcional.
Ocurre cuando el sitio se publica sin haber ejecutado las pruebas, por ejemplo tras un cambio que
solo afecta a la documentacion.</p>
<p><a href="../index.html">Volver al portal</a></p></main></body></html>`
  );
  console.log('Sin reporte funcional en esta corrida: se publica una pagina sustituta.');
}

/* 5. Marcador que evita el procesamiento por Jekyll en GitHub Pages */

writeFileSync(join(DESTINO, '.nojekyll'), '');

console.log(`Sitio ensamblado en ${DESTINO}.`);
