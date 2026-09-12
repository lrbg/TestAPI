/* Utilidades compartidas del portal.
   Sin dependencias externas: las graficas se dibujan como SVG en linea. */

export const RUTA_DATOS = 'datos';

/** Lee un archivo de datos y devuelve null si no esta disponible todavia. */
export async function cargarDatos(nombre) {
  try {
    const respuesta = await fetch(`${RUTA_DATOS}/${nombre}?v=${Date.now()}`, { cache: 'no-store' });
    if (!respuesta.ok) return null;
    return await respuesta.json();
  } catch {
    return null;
  }
}

export function fecha(iso, conHora = true) {
  if (!iso) return 'sin fecha';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'sin fecha';
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(conHora ? { hour: '2-digit', minute: '2-digit' } : {}),
    timeZone: 'America/Mexico_City',
  });
}

export function numero(valor, decimales = 0) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return 'sin dato';
  return Number(valor).toLocaleString('es-MX', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

export function claseDeVeredicto(veredicto) {
  if (veredicto === 'aprobado') return 'exito';
  if (veredicto === 'con observaciones') return 'alerta';
  if (veredicto === 'rechazado') return 'fallo';
  return 'neutro';
}

export function escapar(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Lee un color del tema activo para que las graficas sigan el modo claro u oscuro. */
function color(nombre) {
  return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim() || '#888';
}

/* ------------------------------------------------------------------ */
/* Graficas                                                            */
/* ------------------------------------------------------------------ */

/**
 * Grafica de barras apiladas: casos aprobados, fallidos y omitidos por ejecucion.
 */
export function graficaDeResultados(contenedor, historico) {
  if (!historico || historico.length === 0) {
    contenedor.innerHTML = '<p class="tenue">Todavía no hay ejecuciones registradas.</p>';
    return;
  }

  const serie = historico.slice(-40).filter((e) => e.funcional);
  if (serie.length === 0) {
    contenedor.innerHTML = '<p class="tenue">Las ejecuciones registradas no incluyen resultados funcionales.</p>';
    return;
  }

  const ancho = 960;
  const alto = 260;
  const margen = { arriba: 16, derecha: 16, abajo: 42, izquierda: 42 };
  const util = { ancho: ancho - margen.izquierda - margen.derecha, alto: alto - margen.arriba - margen.abajo };

  /* El techo se redondea al alza hasta un multiplo de cuatro para que las
     cuatro lineas de referencia caigan siempre en valores enteros. */
  const bruto = Math.max(...serie.map((e) => e.funcional.total), 1);
  const maximo = Math.max(4, Math.ceil(bruto / 4) * 4);
  const anchoBarra = Math.max(4, Math.min(26, (util.ancho / serie.length) * 0.66));
  const paso = util.ancho / serie.length;

  const escalaY = (v) => util.alto - (v / maximo) * util.alto;

  const piezas = [];

  // Lineas de referencia horizontales
  for (let i = 0; i <= 4; i += 1) {
    const valor = (maximo / 4) * i;
    const y = margen.arriba + escalaY(valor);
    piezas.push(
      `<line x1="${margen.izquierda}" y1="${y}" x2="${ancho - margen.derecha}" y2="${y}" stroke="${color('--borde')}" stroke-width="1"/>`,
      `<text x="${margen.izquierda - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="${color('--texto-3')}">${Math.round(valor)}</text>`
    );
  }

  serie.forEach((entrada, indice) => {
    const f = entrada.funcional;
    const x = margen.izquierda + paso * indice + (paso - anchoBarra) / 2;

    let acumulado = 0;
    const segmentos = [
      { cantidad: f.aprobadas, tono: color('--exito') },
      { cantidad: f.fallidas, tono: color('--fallo') },
      { cantidad: f.omitidas, tono: color('--texto-3') },
    ];

    for (const segmento of segmentos) {
      if (segmento.cantidad <= 0) continue;
      const altura = (segmento.cantidad / maximo) * util.alto;
      const y = margen.arriba + escalaY(acumulado + segmento.cantidad);
      piezas.push(
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${anchoBarra.toFixed(1)}" height="${Math.max(
          altura,
          1
        ).toFixed(1)}" fill="${segmento.tono}" rx="1"><title>Ejecución ${entrada.numero} del ${fecha(
          entrada.fecha
        )}: ${f.aprobadas} aprobadas, ${f.fallidas} fallidas, ${f.omitidas} omitidas</title></rect>`
      );
      acumulado += segmento.cantidad;
    }

    if (indice % Math.ceil(serie.length / 10) === 0) {
      piezas.push(
        `<text x="${(x + anchoBarra / 2).toFixed(1)}" y="${alto - 22}" text-anchor="middle" font-size="10" fill="${color(
          '--texto-3'
        )}">${entrada.numero}</text>`
      );
    }
  });

  piezas.push(
    `<text x="${ancho / 2}" y="${alto - 6}" text-anchor="middle" font-size="11" fill="${color(
      '--texto-3'
    )}">Número de ejecución</text>`
  );

  contenedor.innerHTML =
    `<svg class="grafica" viewBox="0 0 ${ancho} ${alto}" role="img" aria-label="Resultados por ejecución">${piezas.join(
      ''
    )}</svg>` +
    `<div class="leyenda">
       <span><i class="muestra" style="background:${color('--exito')}"></i>Aprobadas</span>
       <span><i class="muestra" style="background:${color('--fallo')}"></i>Fallidas</span>
       <span><i class="muestra" style="background:${color('--texto-3')}"></i>Omitidas</span>
     </div>`;
}

/**
 * Grafica de lineas: evolucion del percentil 95 de los escenarios de desempeno.
 */
export function graficaDeDesempeno(contenedor, historico) {
  const serie = (historico ?? []).slice(-40).filter((e) => (e.desempeno ?? []).length > 0);

  if (serie.length < 2) {
    contenedor.innerHTML =
      '<p class="tenue">Se necesitan al menos dos ejecuciones con mediciones de desempeño para trazar la evolución.</p>';
    return;
  }

  const escenarios = [...new Set(serie.flatMap((e) => e.desempeno.map((d) => d.escenario)))];
  const tonos = [color('--acento'), color('--exito'), color('--alerta'), color('--fallo')];

  const ancho = 960;
  const alto = 260;
  const margen = { arriba: 16, derecha: 16, abajo: 42, izquierda: 52 };
  const util = { ancho: ancho - margen.izquierda - margen.derecha, alto: alto - margen.arriba - margen.abajo };

  const valores = serie.flatMap((e) => e.desempeno.map((d) => d.p95).filter((v) => typeof v === 'number'));
  const maximo = Math.max(...valores, 100) * 1.15;

  const x = (i) => margen.izquierda + (i / Math.max(serie.length - 1, 1)) * util.ancho;
  const y = (v) => margen.arriba + util.alto - (v / maximo) * util.alto;

  const piezas = [];

  for (let i = 0; i <= 4; i += 1) {
    const valor = (maximo / 4) * i;
    const py = y(valor);
    piezas.push(
      `<line x1="${margen.izquierda}" y1="${py}" x2="${ancho - margen.derecha}" y2="${py}" stroke="${color('--borde')}" stroke-width="1"/>`,
      `<text x="${margen.izquierda - 8}" y="${py + 4}" text-anchor="end" font-size="10" fill="${color('--texto-3')}">${Math.round(valor)}</text>`
    );
  }

  escenarios.forEach((escenario, indice) => {
    const tono = tonos[indice % tonos.length];
    const puntos = [];

    serie.forEach((entrada, i) => {
      const medicion = entrada.desempeno.find((d) => d.escenario === escenario);
      if (!medicion || typeof medicion.p95 !== 'number') return;
      puntos.push({ x: x(i), y: y(medicion.p95), valor: medicion.p95, entrada });
    });

    if (puntos.length === 0) return;

    const trazo = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    piezas.push(`<path d="${trazo}" fill="none" stroke="${tono}" stroke-width="2" stroke-linejoin="round"/>`);

    for (const p of puntos) {
      piezas.push(
        `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="${tono}"><title>${escenario}, ejecución ${
          p.entrada.numero
        }: ${Math.round(p.valor)} ms</title></circle>`
      );
    }
  });

  piezas.push(
    `<text x="14" y="${margen.arriba + util.alto / 2}" transform="rotate(-90 14 ${
      margen.arriba + util.alto / 2
    })" text-anchor="middle" font-size="11" fill="${color('--texto-3')}">Percentil 95 en ms</text>`,
    `<text x="${ancho / 2}" y="${alto - 6}" text-anchor="middle" font-size="11" fill="${color(
      '--texto-3'
    )}">Ejecuciones en orden cronologico</text>`
  );

  const leyenda = escenarios
    .map(
      (e, i) =>
        `<span><i class="muestra" style="background:${tonos[i % tonos.length]}"></i>${escapar(e)}</span>`
    )
    .join('');

  contenedor.innerHTML =
    `<svg class="grafica" viewBox="0 0 ${ancho} ${alto}" role="img" aria-label="Evolucion del percentil 95">${piezas.join(
      ''
    )}</svg><div class="leyenda">${leyenda}</div>`;
}

/** Marca el enlace de navegacion correspondiente a la pagina en curso. */
export function marcarNavegacion() {
  const actual = location.pathname.split('/').pop() || 'index.html';
  for (const enlace of document.querySelectorAll('.navegacion a')) {
    if (enlace.getAttribute('href') === actual) enlace.setAttribute('aria-current', 'page');
  }
}

marcarNavegacion();
