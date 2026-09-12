/**
 * Ejercicio 1 - GET /images/search
 * Escenarios de borde: los valores frontera de cada parametro y las zonas
 * donde la especificacion deja de ser explicita.
 *
 * Varias de estas verificaciones documentan desviaciones reales entre lo
 * declarado y lo observado. En esos casos la prueba afirma el comportamiento
 * real y registra la desviacion como anotacion, de modo que el defecto quede
 * visible en el reporte sin dejar la suite en rojo de forma permanente.
 */

import { test, expect } from '@playwright/test';
import { consulta, esperarColeccionValida, esperarError, llamar } from './soporte/cliente';
import { RANGO_LIMIT, TOPE_ANONIMO } from './soporte/entorno';

test.describe('Busqueda de imagenes - escenarios de borde', () => {
  test('IMG-B-01 Las fronteras inferiores de limit se comportan de forma coherente @borde @critico', async ({
    request,
  }, info) => {
    const invalido = await llamar(request, info, `/images/search${consulta({ limit: 0 })}`, {
      etiqueta: 'IMG-B-01 limit igual a 0, un paso fuera del rango',
    });
    esperarError(invalido, 400);

    const valido = await llamar(
      request,
      info,
      `/images/search${consulta({ limit: RANGO_LIMIT.minimo })}`,
      { etiqueta: 'IMG-B-01 limit igual a 1, frontera valida' }
    );
    expect(esperarColeccionValida(valido)).toHaveLength(1);
  });

  test('IMG-B-02 Las fronteras superiores de limit se comportan de forma coherente @borde @critico', async ({
    request,
  }, info) => {
    const valido = await llamar(
      request,
      info,
      `/images/search${consulta({ limit: RANGO_LIMIT.maximo })}`,
      { etiqueta: 'IMG-B-02 limit igual a 100, frontera valida' }
    );
    expect(esperarColeccionValida(valido)).toHaveLength(RANGO_LIMIT.maximo);

    const invalido = await llamar(
      request,
      info,
      `/images/search${consulta({ limit: RANGO_LIMIT.maximo + 1 })}`,
      { etiqueta: 'IMG-B-02 limit igual a 101, un paso fuera del rango' }
    );
    esperarError(invalido, 400);
  });

  test('IMG-B-03 El consumidor anonimo recibe una coleccion truncada sin aviso @borde @critico', async ({
    request,
  }, info) => {
    const solicitado = 50;

    const anonimo = await llamar(request, info, `/images/search${consulta({ limit: solicitado })}`, {
      autenticado: false,
      etiqueta: `IMG-B-03 solicitud anonima de ${solicitado} imagenes`,
    });
    const autenticado = await llamar(
      request,
      info,
      `/images/search${consulta({ limit: solicitado })}`,
      { etiqueta: `IMG-B-03 solicitud autenticada de ${solicitado} imagenes` }
    );

    const cantidadAnonima = esperarColeccionValida(anonimo).length;
    const cantidadAutenticada = esperarColeccionValida(autenticado).length;

    expect(cantidadAnonima, 'El consumidor anonimo recibe una cantidad acotada').toBe(
      TOPE_ANONIMO
    );
    expect(cantidadAutenticada, 'El consumidor autenticado recibe lo solicitado').toBe(solicitado);

    const avisoDeTruncamiento =
      anonimo.encabezados['pagination-count'] ?? anonimo.encabezados['x-result-truncated'];

    info.annotations.push({
      type: 'desviacion',
      description:
        `Se solicitaron ${solicitado} elementos sin credencial y se recibieron ${cantidadAnonima}. ` +
        'El servicio acepta el valor, lo trunca y no emite ningun encabezado que lo informe, ' +
        'de modo que el consumidor no puede distinguir "no hay mas datos" de "tu plan no alcanza". ' +
        'Referencia: hallazgo H-02.',
    });

    expect(
      avisoDeTruncamiento,
      'Registro del hallazgo: no existe encabezado que informe el truncamiento'
    ).toBeUndefined();
  });

  test('IMG-B-04 Una pagina mas alla del ultimo resultado devuelve una coleccion vacia @borde', async ({
    request,
  }, info) => {
    const r = await llamar(
      request,
      info,
      `/images/search${consulta({ limit: 10, order: 'ASC', page: 500000 })}`,
      { etiqueta: 'IMG-B-04 pagina mas alla del total' }
    );

    const imagenes = esperarColeccionValida(r);
    expect(imagenes, 'Agotado el catalogo, la respuesta correcta es una coleccion vacia').toHaveLength(
      0
    );

    const total = Number(r.encabezados['pagination-count']);
    expect(total, 'El total informado debe permitir al cliente detectar el fin del recorrido').toBeGreaterThan(
      0
    );
  });

  test('IMG-B-05 La ultima pagina util es consistente con el total informado @borde', async ({
    request,
  }, info) => {
    const tamano = 10;

    const sondeo = await llamar(
      request,
      info,
      `/images/search${consulta({ limit: tamano, order: 'ASC', page: 0 })}`,
      { etiqueta: 'IMG-B-05 lectura del total disponible' }
    );
    esperarColeccionValida(sondeo);

    const total = Number(sondeo.encabezados['pagination-count']);
    test.skip(!Number.isFinite(total) || total <= 0, 'El servicio no informo el total disponible');

    const ultimaPagina = Math.ceil(total / tamano) - 1;

    const r = await llamar(
      request,
      info,
      `/images/search${consulta({ limit: tamano, order: 'ASC', page: ultimaPagina })}`,
      { etiqueta: `IMG-B-05 ultima pagina calculada (${ultimaPagina})` }
    );

    const imagenes = esperarColeccionValida(r);
    expect(
      imagenes.length,
      'La ultima pagina calculada a partir del total debe traer resultados'
    ).toBeGreaterThan(0);
    expect(imagenes.length).toBeLessThanOrEqual(tamano);
  });

  test('IMG-B-06 Un valor invalido de size no interrumpe el servicio pero tampoco se rechaza @borde', async ({
    request,
  }, info) => {
    const r = await llamar(request, info, `/images/search${consulta({ size: 'gigantesco' })}`, {
      etiqueta: 'IMG-B-06 size fuera del conjunto conocido',
    });

    expect(r.estado, 'El servicio no debe caer ante un valor desconocido').toBeLessThan(500);

    if (r.estado === 200) {
      info.annotations.push({
        type: 'desviacion',
        description:
          'size acepta cualquier cadena y la ignora en silencio, mientras que order rechaza lo ' +
          'desconocido con 400. La validacion de parametros no es uniforme entre campos del ' +
          'mismo recurso. Referencia: hallazgo H-04.',
      });
      esperarColeccionValida(r);
    }
  });

  test('IMG-B-07 El filtro mime_types no restringe el tipo de los resultados @borde @critico', async ({
    request,
  }, info) => {
    const r = await llamar(
      request,
      info,
      `/images/search${consulta({ limit: 10, mime_types: 'png' })}`,
      { etiqueta: 'IMG-B-07 filtro por tipo de contenido png' }
    );

    const imagenes = esperarColeccionValida(r);
    expect(imagenes.length).toBeGreaterThan(0);

    const fueraDelFiltro = imagenes.filter((i) => !String(i.url).toLowerCase().endsWith('.png'));

    if (fueraDelFiltro.length > 0) {
      info.annotations.push({
        type: 'desviacion',
        description:
          `Se solicito mime_types=png y ${fueraDelFiltro.length} de ${imagenes.length} resultados ` +
          `tienen otra extension. Ejemplo: ${fueraDelFiltro[0].url}. El filtro se acepta y no se ` +
          'aplica. Referencia: hallazgo H-03.',
      });
    }

    // Registro del comportamiento observado: el filtro no se honra.
    expect(
      fueraDelFiltro.length,
      'Registro del hallazgo H-03: el filtro mime_types no restringe los resultados'
    ).toBeGreaterThan(0);
  });

  test('IMG-B-08 Un tipo de contenido sin sentido tampoco es rechazado @borde', async ({
    request,
  }, info) => {
    const r = await llamar(
      request,
      info,
      `/images/search${consulta({ mime_types: 'application/pdf' })}`,
      { etiqueta: 'IMG-B-08 tipo de contenido no aplicable a imagenes' }
    );

    expect(r.estado).toBeLessThan(500);

    if (r.estado === 200) {
      const imagenes = esperarColeccionValida(r);
      expect(
        imagenes.length,
        'Registro del hallazgo H-03: un tipo no aplicable devuelve resultados igualmente'
      ).toBeGreaterThan(0);
    }
  });

  test('IMG-B-09 Un parametro desconocido es ignorado sin afectar el resultado @borde', async ({
    request,
  }, info) => {
    const r = await llamar(
      request,
      info,
      `/images/search${consulta({ limit: 3, parametro_inexistente: 'valor' })}`,
      { etiqueta: 'IMG-B-09 parametro no contemplado en el contrato' }
    );

    const imagenes = esperarColeccionValida(r);
    expect(
      imagenes,
      'Un parametro desconocido no debe alterar el comportamiento del resto'
    ).toHaveLength(3);

    info.annotations.push({
      type: 'observacion',
      description:
        'El servicio ignora los parametros no reconocidos en lugar de rechazarlos. Es una ' +
        'decision valida de compatibilidad, pero conviene que quede documentada: un error de ' +
        'escritura en el nombre de un filtro pasa inadvertido para el consumidor.',
    });
  });

  test('IMG-B-10 El parametro format no altera la representacion devuelta @borde', async ({
    request,
  }, info) => {
    const comoJson = await llamar(
      request,
      info,
      `/images/search${consulta({ limit: 1, format: 'json' })}`,
      { etiqueta: 'IMG-B-10 format igual a json' }
    );
    const comoSrc = await llamar(
      request,
      info,
      `/images/search${consulta({ limit: 1, format: 'src' })}`,
      { etiqueta: 'IMG-B-10 format igual a src' }
    );

    esperarColeccionValida(comoJson);

    expect(comoSrc.estado, 'El servicio responde con exito en ambos casos').toBe(200);
    expect(
      comoSrc.encabezados['content-type'],
      'Registro del hallazgo H-05: format=src sigue devolviendo JSON'
    ).toContain('application/json');

    info.annotations.push({
      type: 'desviacion',
      description:
        'format=src deberia entregar la imagen o una redireccion a ella segun la documentacion ' +
        'publica del servicio; en la practica devuelve la misma coleccion JSON. Un cliente que ' +
        'construya su interfaz sobre ese parametro obtendra un resultado distinto al esperado. ' +
        'Referencia: hallazgo H-05.',
    });
  });

  test('IMG-B-11 Los encabezados de paginacion solo acompanan al orden determinista @borde', async ({
    request,
  }, info) => {
    const aleatorio = await llamar(
      request,
      info,
      `/images/search${consulta({ limit: 5, order: 'RANDOM' })}`,
      { etiqueta: 'IMG-B-11 consulta con orden aleatorio' }
    );
    const ordenado = await llamar(
      request,
      info,
      `/images/search${consulta({ limit: 5, order: 'ASC', page: 0 })}`,
      { etiqueta: 'IMG-B-11 consulta con orden ascendente' }
    );

    esperarColeccionValida(aleatorio);
    esperarColeccionValida(ordenado);

    expect(
      aleatorio.encabezados['pagination-count'],
      'Sin orden estable la paginacion carece de sentido y el servicio omite los encabezados'
    ).toBeUndefined();
    expect(
      ordenado.encabezados['pagination-count'],
      'Con orden estable los encabezados deben estar presentes'
    ).toBeDefined();

    info.annotations.push({
      type: 'observacion',
      description:
        'La especificacion indica que los encabezados de paginacion "pueden" aparecer sin precisar ' +
        'cuando. La condicion observada es: orden determinista (ASC o DESC) y peticion autenticada. ' +
        'Un cliente que los lea incondicionalmente obtendra valores nulos. Referencia: hallazgo H-06.',
    });
  });
});
