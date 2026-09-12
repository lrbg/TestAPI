/**
 * Ejercicio 2 - GET /breeds/search
 * Escenarios negativos y de borde sobre el parametro de busqueda.
 */

import { test, expect } from '@playwright/test';
import { consulta, esperarColeccionValida, esperarError, llamar, mensajesDeError } from './soporte/cliente';
import { RANGO_Q } from './soporte/entorno';
import { esquemaError, validarContrato } from './soporte/esquemas';

test.describe('Busqueda de razas - escenarios negativos', () => {
  test('BRD-N-01 Un parametro de busqueda vacio es rechazado @negativo @critico', async ({
    request,
  }, info) => {
    const r = await llamar(request, info, '/breeds/search?q=', {
      etiqueta: 'BRD-N-01 parametro de busqueda vacio',
    });

    const error = esperarError(r, 400);
    expect(mensajesDeError(error).join(' ')).toContain(
      'q must be longer than or equal to 1 characters'
    );
  });

  test('BRD-N-02 Una consulta sin coincidencias devuelve una coleccion vacia, no un error @negativo @critico', async ({
    request,
  }, info) => {
    const r = await llamar(
      request,
      info,
      `/breeds/search${consulta({ q: 'razainexistente' })}`,
      { etiqueta: 'BRD-N-02 consulta sin coincidencias' }
    );

    const razas = esperarColeccionValida(r);
    expect(
      razas,
      'La ausencia de coincidencias es un resultado valido de la busqueda, no un fallo'
    ).toHaveLength(0);
  });

  test('BRD-N-03 Un parametro de busqueda excesivamente largo es rechazado @negativo', async ({
    request,
  }, info) => {
    const r = await llamar(
      request,
      info,
      `/breeds/search${consulta({ q: 'a'.repeat(RANGO_Q.maximo + 2) })}`,
      { etiqueta: `BRD-N-03 consulta de ${RANGO_Q.maximo + 2} caracteres` }
    );

    const error = esperarError(r, 400);
    expect(mensajesDeError(error).join(' ')).toContain(
      `q must be shorter than or equal to ${RANGO_Q.maximo} characters`
    );
  });

  test('BRD-N-04 Las fronteras de longitud del parametro de busqueda son coherentes @borde @critico', async ({
    request,
  }, info) => {
    const enElLimite = await llamar(
      request,
      info,
      `/breeds/search${consulta({ q: 'a'.repeat(RANGO_Q.maximo) })}`,
      { etiqueta: `BRD-N-04 consulta de ${RANGO_Q.maximo} caracteres, frontera valida` }
    );
    expect(enElLimite.estado, 'La longitud maxima declarada debe ser aceptada').toBe(200);

    const unPasoFuera = await llamar(
      request,
      info,
      `/breeds/search${consulta({ q: 'a'.repeat(RANGO_Q.maximo + 1) })}`,
      { etiqueta: `BRD-N-04 consulta de ${RANGO_Q.maximo + 1} caracteres, un paso fuera` }
    );
    esperarError(unPasoFuera, 400);

    const minimo = await llamar(
      request,
      info,
      `/breeds/search${consulta({ q: 'a'.repeat(RANGO_Q.minimo) })}`,
      { etiqueta: 'BRD-N-04 consulta de un caracter, frontera inferior valida' }
    );
    expect(minimo.estado, 'Un solo caracter debe ser una busqueda valida').toBe(200);
  });

  test('BRD-N-05 Un valor no contemplado en attach_image no interrumpe el servicio @negativo', async ({
    request,
  }, info) => {
    const r = await llamar(
      request,
      info,
      `/breeds/search${consulta({ q: 'siam', attach_image: 9 })}`,
      { etiqueta: 'BRD-N-05 attach_image con un valor fuera del par 0 y 1' }
    );

    expect(r.estado, 'El servicio no debe caer ante un valor inesperado').toBeLessThan(500);
    if (r.estado === 200) esperarColeccionValida(r);
  });

  test('BRD-N-06 attach_image no modifica la respuesta en ninguno de sus dos valores @negativo @critico', async ({
    request,
  }, info) => {
    const activado = await llamar(
      request,
      info,
      `/breeds/search${consulta({ q: 'siam', attach_image: 1 })}`,
      { etiqueta: 'BRD-N-06 attach_image activado' }
    );
    const desactivado = await llamar(
      request,
      info,
      `/breeds/search${consulta({ q: 'siam', attach_image: 0 })}`,
      { etiqueta: 'BRD-N-06 attach_image desactivado' }
    );

    const con = esperarColeccionValida(activado);
    const sin = esperarColeccionValida(desactivado);

    const imagenConActivado = con[0]?.image !== undefined && con[0]?.image !== null;
    const imagenConDesactivado = sin[0]?.image !== undefined && sin[0]?.image !== null;

    if (imagenConActivado && imagenConDesactivado) {
      info.annotations.push({
        type: 'desviacion',
        description:
          'La especificacion indica que la informacion de imagen se devuelve cuando attach_image ' +
          'vale 1. En la practica se devuelve tambien con attach_image=0 y las dos respuestas son ' +
          'identicas byte a byte: el parametro no tiene efecto observable. Un cliente que confie ' +
          'en el para controlar el tamano de la carga util no obtendra ninguna reduccion. ' +
          'Referencia: hallazgo H-01.',
      });
    }

    expect(
      JSON.stringify(sin),
      'Registro del hallazgo H-01: ambas respuestas son identicas'
    ).toBe(JSON.stringify(con));
  });

  test('BRD-N-07 Un verbo no soportado no se atiende @negativo', async ({ request }, info) => {
    const r = await llamar(request, info, `/breeds/search${consulta({ q: 'beng' })}`, {
      metodo: 'post',
      etiqueta: 'BRD-N-07 verbo POST sobre un recurso de solo lectura',
    });

    expect(r.estado).toBeGreaterThanOrEqual(400);

    if (r.estado === 404) {
      info.annotations.push({
        type: 'desviacion',
        description:
          'Ante un verbo no soportado el servicio responde 404 en lugar de 405. Referencia: hallazgo H-07.',
      });
    }
  });

  test('BRD-N-08 El error de validacion conserva la forma comun del servicio @negativo @contrato', async ({
    request,
  }, info) => {
    const r = await llamar(request, info, '/breeds/search?q=', {
      etiqueta: 'BRD-N-08 forma del error de validacion',
    });

    const error = esperarError(r, 400);
    const { valido, errores } = validarContrato(esquemaError, error);
    expect(valido, `El cuerpo de error no cumple su contrato: ${errores.join('; ')}`).toBe(true);
    expect(error.path, 'El error debe indicar la ruta solicitada').toContain('/breeds/search');
  });
});
