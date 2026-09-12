/**
 * Ejercicio 1 - GET /images/search
 * Escenarios funcionales: comportamiento esperado con entradas validas.
 *
 * Nota de diseno: el endpoint devuelve resultados aleatorios por definicion.
 * Ninguna verificacion compara contra un identificador fijo; se verifican
 * invariantes del contrato y del comportamiento, que es lo unico determinista
 * que ofrece el servicio.
 */

import { test, expect } from '@playwright/test';
import { consulta, esperarColeccionValida, llamar } from './soporte/cliente';
import { RANGO_LIMIT, TOPE_ANONIMO, UMBRALES, VALORES_ORDER } from './soporte/entorno';
import { arregloDe, esquemaImagenAnonima, validarContrato } from './soporte/esquemas';

test.describe('Busqueda de imagenes - escenarios funcionales', () => {
  test('IMG-F-01 La busqueda sin parametros devuelve exactamente una imagen @funcional @critico', async ({
    request,
  }, info) => {
    const r = await llamar(request, info, '/images/search', {
      autenticado: false,
      etiqueta: 'IMG-F-01 busqueda sin parametros',
    });

    const imagenes = esperarColeccionValida(r);
    expect(imagenes, 'El valor por defecto de limit es 1').toHaveLength(1);
    expect(r.duracionMs).toBeLessThan(UMBRALES.respuestaMaximaMs);
  });

  test('IMG-F-02 El parametro limit gobierna el tamano de la coleccion @funcional @critico', async ({
    request,
  }, info) => {
    for (const solicitado of [1, 3, 5, 10]) {
      const r = await llamar(request, info, `/images/search${consulta({ limit: solicitado })}`, {
        etiqueta: `IMG-F-02 limit igual a ${solicitado}`,
      });
      const imagenes = esperarColeccionValida(r);
      expect(imagenes, `Se solicitaron ${solicitado} imagenes`).toHaveLength(solicitado);
    }
  });

  test('IMG-F-03 Toda imagen expone identificador, direccion y dimensiones utiles @funcional @critico', async ({
    request,
  }, info) => {
    const r = await llamar(request, info, `/images/search${consulta({ limit: 10 })}`, {
      autenticado: false,
      etiqueta: 'IMG-F-03 campos obligatorios',
    });

    const imagenes = esperarColeccionValida(r);
    expect(imagenes.length).toBeGreaterThan(0);

    for (const imagen of imagenes) {
      expect(imagen.id, 'El identificador no puede venir vacio').toBeTruthy();
      expect(imagen.url, 'La direccion debe servirse sobre HTTPS').toMatch(/^https:\/\//);
      expect(imagen.width, 'El ancho debe ser un entero positivo').toBeGreaterThan(0);
      expect(imagen.height, 'El alto debe ser un entero positivo').toBeGreaterThan(0);
    }
  });

  test('IMG-F-04 Los identificadores devueltos en una misma pagina no se repiten @funcional', async ({
    request,
  }, info) => {
    const r = await llamar(request, info, `/images/search${consulta({ limit: 10 })}`, {
      etiqueta: 'IMG-F-04 unicidad dentro de la pagina',
    });

    const imagenes = esperarColeccionValida(r);
    const identificadores = imagenes.map((i) => i.id);
    const unicos = new Set(identificadores);
    expect(
      unicos.size,
      'Una misma imagen no debe aparecer dos veces en el mismo conjunto de resultados'
    ).toBe(identificadores.length);
  });

  test('IMG-F-05 La busqueda aleatoria entrega conjuntos distintos entre llamadas @funcional', async ({
    request,
  }, info) => {
    const muestras: string[][] = [];
    for (let intento = 0; intento < 3; intento += 1) {
      const r = await llamar(
        request,
        info,
        `/images/search${consulta({ limit: 10, order: 'RANDOM' })}`,
        { etiqueta: `IMG-F-05 muestra aleatoria ${intento + 1}` }
      );
      muestras.push(esperarColeccionValida(r).map((i) => i.id));
    }

    const firmas = new Set(muestras.map((m) => m.join(',')));
    expect(
      firmas.size,
      'Tres extracciones aleatorias consecutivas identicas indican que el orden aleatorio no opera'
    ).toBeGreaterThan(1);
  });

  test('IMG-F-06 El filtro has_breeds devuelve imagenes con raza asociada @funcional', async ({
    request,
  }, info) => {
    const r = await llamar(
      request,
      info,
      `/images/search${consulta({ limit: 5, has_breeds: 1 })}`,
      { etiqueta: 'IMG-F-06 filtro por raza asociada' }
    );

    const imagenes = esperarColeccionValida(r);
    expect(imagenes).toHaveLength(5);

    // La representacion autenticada expone el arreglo breeds; se verifica el
    // cumplimiento real del filtro sobre ese arreglo.
    const conArreglo = imagenes.filter((i) => Array.isArray(i.breeds));
    if (conArreglo.length > 0) {
      for (const imagen of conArreglo) {
        expect(
          imagen.breeds.length,
          `La imagen ${imagen.id} se devolvio bajo has_breeds=1 sin raza asociada`
        ).toBeGreaterThan(0);
      }
    }
  });

  test('IMG-F-07 Los tres valores de order son aceptados @funcional', async ({ request }, info) => {
    for (const valor of VALORES_ORDER) {
      const r = await llamar(
        request,
        info,
        `/images/search${consulta({ limit: 3, order: valor })}`,
        { etiqueta: `IMG-F-07 order igual a ${valor}` }
      );
      const imagenes = esperarColeccionValida(r);
      expect(imagenes, `order=${valor} debe seguir respetando limit`).toHaveLength(3);
    }
  });

  test('IMG-F-08 La paginacion ordenada recorre resultados distintos @funcional @critico', async ({
    request,
  }, info) => {
    const pagina0 = await llamar(
      request,
      info,
      `/images/search${consulta({ limit: 5, order: 'ASC', page: 0 })}`,
      { etiqueta: 'IMG-F-08 pagina 0 en orden ascendente' }
    );
    const pagina1 = await llamar(
      request,
      info,
      `/images/search${consulta({ limit: 5, order: 'ASC', page: 1 })}`,
      { etiqueta: 'IMG-F-08 pagina 1 en orden ascendente' }
    );

    const ids0 = esperarColeccionValida(pagina0).map((i) => i.id);
    const ids1 = esperarColeccionValida(pagina1).map((i) => i.id);

    expect(ids0).toHaveLength(5);
    expect(ids1).toHaveLength(5);

    const traslape = ids0.filter((id) => ids1.includes(id));
    expect(
      traslape,
      'Dos paginas consecutivas de un listado ordenado no deben compartir elementos'
    ).toHaveLength(0);
  });

  test('IMG-F-09 La paginacion ordenada es estable entre peticiones equivalentes @funcional', async ({
    request,
  }, info) => {
    const ruta = `/images/search${consulta({ limit: 5, order: 'ASC', page: 0 })}`;

    const primera = await llamar(request, info, ruta, {
      etiqueta: 'IMG-F-09 primera lectura ordenada',
    });
    const segunda = await llamar(request, info, ruta, {
      etiqueta: 'IMG-F-09 segunda lectura ordenada',
    });

    const ids1 = esperarColeccionValida(primera).map((i) => i.id);
    const ids2 = esperarColeccionValida(segunda).map((i) => i.id);

    expect(
      ids2,
      'Un orden determinista debe entregar el mismo resultado ante la misma consulta'
    ).toEqual(ids1);
  });

  test('IMG-F-10 Los encabezados de paginacion acompanan al orden determinista @funcional @critico', async ({
    request,
  }, info) => {
    const r = await llamar(
      request,
      info,
      `/images/search${consulta({ limit: 5, order: 'DESC', page: 0 })}`,
      { etiqueta: 'IMG-F-10 encabezados de paginacion' }
    );

    esperarColeccionValida(r);

    const total = r.encabezados['pagination-count'];
    const pagina = r.encabezados['pagination-page'];
    const tamano = r.encabezados['pagination-limit'];

    expect(total, 'Pagination-Count debe acompanar a una consulta ordenada').toBeDefined();
    expect(pagina, 'Pagination-Page debe acompanar a una consulta ordenada').toBeDefined();
    expect(tamano, 'Pagination-Limit debe acompanar a una consulta ordenada').toBeDefined();

    expect(Number(total)).toBeGreaterThan(0);
    expect(Number(pagina)).toBe(0);
    expect(Number(tamano)).toBe(5);
  });

  test('IMG-F-11 El limite superior declarado de limit es atendido para un consumidor autenticado @funcional', async ({
    request,
  }, info) => {
    const r = await llamar(
      request,
      info,
      `/images/search${consulta({ limit: RANGO_LIMIT.maximo })}`,
      { etiqueta: 'IMG-F-11 limit en su valor maximo' }
    );

    const imagenes = esperarColeccionValida(r);
    expect(
      imagenes,
      `El contrato declara ${RANGO_LIMIT.maximo} como maximo y debe entregarlo`
    ).toHaveLength(RANGO_LIMIT.maximo);
  });

  test('IMG-F-12 La representacion anonima cumple su contrato reducido @funcional @contrato', async ({
    request,
  }, info) => {
    const r = await llamar(request, info, `/images/search${consulta({ limit: 5 })}`, {
      autenticado: false,
      etiqueta: 'IMG-F-12 contrato de la representacion anonima',
    });

    const imagenes = esperarColeccionValida(r);
    expect(imagenes.length).toBeLessThanOrEqual(TOPE_ANONIMO);

    const { valido, errores } = validarContrato(arregloDe(esquemaImagenAnonima), imagenes);
    expect(valido, `Desviaciones de contrato: ${errores.join('; ')}`).toBe(true);
  });
});
