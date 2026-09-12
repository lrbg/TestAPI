/**
 * Verificaciones no funcionales ejecutadas dentro de la suite funcional.
 *
 * Cubren atributos de calidad observables en una sola peticion o en una serie
 * corta: tiempo de respuesta, uso de compresion, coherencia de la cache,
 * disponibilidad y comportamiento de origen cruzado. La medicion formal de
 * capacidad bajo carga vive en la suite de k6 y no se duplica aqui.
 *
 * Trazabilidad: ISO/IEC 25010:2023, caracteristicas "Eficiencia de desempeno",
 * "Fiabilidad" y "Compatibilidad".
 */

import { test, expect } from '@playwright/test';
import { consulta, esperarColeccionValida, llamar } from './soporte/cliente';
import { UMBRALES } from './soporte/entorno';

/** Calcula el percentil solicitado sobre una serie de mediciones. */
function percentil(serie: number[], p: number): number {
  const ordenada = [...serie].sort((a, b) => a - b);
  const indice = Math.min(ordenada.length - 1, Math.ceil((p / 100) * ordenada.length) - 1);
  return ordenada[Math.max(0, indice)];
}

test.describe('Atributos no funcionales', () => {
  test('NFN-01 La busqueda de imagenes responde dentro del tiempo objetivo @no-funcional @critico', async ({
    request,
  }, info) => {
    const mediciones: number[] = [];

    for (let i = 0; i < 10; i += 1) {
      const r = await llamar(request, info, `/images/search${consulta({ limit: 1 })}`, {
        etiqueta: `NFN-01 medicion ${i + 1} de 10`,
      });
      esperarColeccionValida(r);
      mediciones.push(r.duracionMs);
    }

    const p50 = percentil(mediciones, 50);
    const p95 = percentil(mediciones, 95);

    info.annotations.push({
      type: 'medicion',
      description: `Muestras: ${mediciones.length}. Mediana: ${p50} ms. Percentil 95: ${p95} ms. Maximo: ${Math.max(
        ...mediciones
      )} ms.`,
    });

    expect(p50, `La mediana de ${p50} ms supera el objetivo`).toBeLessThan(
      UMBRALES.respuestaObjetivoMs
    );
    expect(p95, `El percentil 95 de ${p95} ms supera el maximo tolerado`).toBeLessThan(
      UMBRALES.respuestaMaximaMs
    );
  });

  test('NFN-02 La busqueda de razas responde dentro del tiempo objetivo @no-funcional @critico', async ({
    request,
  }, info) => {
    const mediciones: number[] = [];

    for (let i = 0; i < 10; i += 1) {
      const r = await llamar(request, info, `/breeds/search${consulta({ q: 'beng' })}`, {
        etiqueta: `NFN-02 medicion ${i + 1} de 10`,
      });
      esperarColeccionValida(r);
      mediciones.push(r.duracionMs);
    }

    const p50 = percentil(mediciones, 50);
    const p95 = percentil(mediciones, 95);

    info.annotations.push({
      type: 'medicion',
      description: `Muestras: ${mediciones.length}. Mediana: ${p50} ms. Percentil 95: ${p95} ms.`,
    });

    expect(p50).toBeLessThan(UMBRALES.respuestaObjetivoMs);
    expect(p95).toBeLessThan(UMBRALES.respuestaMaximaMs);
  });

  test('NFN-03 El tiempo de respuesta no se degrada de forma desproporcionada con el volumen @no-funcional', async ({
    request,
  }, info) => {
    const medir = async (limite: number) => {
      const muestras: number[] = [];
      for (let i = 0; i < 5; i += 1) {
        const r = await llamar(request, info, `/images/search${consulta({ limit: limite })}`, {
          etiqueta: `NFN-03 limit ${limite}, muestra ${i + 1}`,
        });
        esperarColeccionValida(r);
        muestras.push(r.duracionMs);
      }
      return percentil(muestras, 50);
    };

    const conUno = await medir(1);
    const conCien = await medir(100);

    info.annotations.push({
      type: 'medicion',
      description: `Mediana con 1 elemento: ${conUno} ms. Mediana con 100 elementos: ${conCien} ms. Factor: ${(
        conCien / Math.max(conUno, 1)
      ).toFixed(2)}.`,
    });

    expect(
      conCien,
      'Multiplicar por cien el volumen no debe multiplicar por diez el tiempo de respuesta'
    ).toBeLessThan(Math.max(conUno * 10, UMBRALES.respuestaMaximaMs));
  });

  test('NFN-04 El servicio comprime las respuestas de volumen apreciable @no-funcional', async ({
    request,
  }, info) => {
    const r = await llamar(request, info, `/images/search${consulta({ limit: 100 })}`, {
      encabezados: { 'Accept-Encoding': 'gzip, deflate, br' },
      etiqueta: 'NFN-04 compresion de la respuesta',
    });

    esperarColeccionValida(r);

    const codificacion = r.encabezados['content-encoding'];
    info.annotations.push({
      type: 'medicion',
      description: `Codificacion aplicada: ${codificacion ?? 'ninguna'}. Tamano del cuerpo sin comprimir: ${
        r.texto.length
      } bytes.`,
    });

    expect(
      codificacion,
      'Una coleccion de cien elementos deberia viajar comprimida para no penalizar al consumidor'
    ).toBeTruthy();
  });

  test('NFN-05 El servicio declara una politica de origen cruzado @no-funcional', async ({
    request,
  }, info) => {
    const r = await llamar(request, info, `/images/search${consulta({ limit: 1 })}`, {
      encabezados: { Origin: 'https://consumidor-de-prueba.example' },
      etiqueta: 'NFN-05 politica de origen cruzado',
    });

    esperarColeccionValida(r);
    expect(
      r.encabezados['access-control-allow-origin'],
      'Sin esta declaracion ningun cliente de navegador puede consumir el servicio'
    ).toBeDefined();
  });

  test('NFN-06 Las respuestas aleatorias no se sirven desde cache @no-funcional @critico', async ({
    request,
  }, info) => {
    const identificadores: string[] = [];

    for (let i = 0; i < 5; i += 1) {
      const r = await llamar(
        request,
        info,
        `/images/search${consulta({ limit: 1, order: 'RANDOM' })}`,
        { etiqueta: `NFN-06 lectura aleatoria ${i + 1}` }
      );
      identificadores.push(esperarColeccionValida(r)[0].id);
    }

    const distintos = new Set(identificadores).size;

    info.annotations.push({
      type: 'medicion',
      description: `Cinco lecturas aleatorias consecutivas devolvieron ${distintos} identificadores distintos.`,
    });

    expect(
      distintos,
      'Si cinco lecturas aleatorias devuelven siempre lo mismo, hay una cache intermedia mal configurada'
    ).toBeGreaterThan(1);
  });

  test('NFN-07 El servicio se mantiene disponible durante una serie sostenida @no-funcional @critico', async ({
    request,
  }, info) => {
    const intentos = 20;
    let exitosas = 0;
    const tiempos: number[] = [];

    for (let i = 0; i < intentos; i += 1) {
      const r = await llamar(request, info, `/images/search${consulta({ limit: 1 })}`, {
        etiqueta: `NFN-07 peticion ${i + 1} de ${intentos}`,
      });
      if (r.estado === 200) exitosas += 1;
      tiempos.push(r.duracionMs);
    }

    const disponibilidad = (exitosas / intentos) * 100;

    info.annotations.push({
      type: 'medicion',
      description: `Peticiones correctas: ${exitosas} de ${intentos} (${disponibilidad.toFixed(
        1
      )} por ciento). Mediana: ${percentil(tiempos, 50)} ms. Percentil 95: ${percentil(
        tiempos,
        95
      )} ms.`,
    });

    expect(
      disponibilidad,
      `La disponibilidad observada fue de ${disponibilidad.toFixed(1)} por ciento`
    ).toBeGreaterThanOrEqual(95);
  });

  test('NFN-08 El servicio acompana sus respuestas de un validador de cache @no-funcional', async ({
    request,
  }, info) => {
    const r = await llamar(request, info, `/breeds/search${consulta({ q: 'beng' })}`, {
      etiqueta: 'NFN-08 validador de cache en datos de referencia',
    });

    esperarColeccionValida(r);

    const validador = r.encabezados['etag'] ?? r.encabezados['last-modified'];
    info.annotations.push({
      type: 'observacion',
      description: `Validador presente: ${validador ?? 'ninguno'}. Directiva de cache: ${
        r.encabezados['cache-control'] ?? 'no declarada'
      }.`,
    });

    expect(
      validador,
      'Un catalogo de referencia estable deberia permitir revalidacion condicional'
    ).toBeTruthy();
  });
});
