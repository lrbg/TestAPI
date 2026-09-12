/**
 * Ejercicio 1 - GET /images/search
 * Escenarios negativos: entradas invalidas y uso incorrecto del recurso.
 *
 * El objetivo no es solo confirmar que el servicio rechaza lo invalido, sino
 * verificar que lo rechaza de forma uniforme y con un mensaje accionable.
 * Un rechazo silencioso es tan defectuoso como una aceptacion indebida.
 */

import { test, expect } from '@playwright/test';
import { consulta, esperarError, llamar, mensajesDeError } from './soporte/cliente';
import { esquemaError, validarContrato } from './soporte/esquemas';

test.describe('Busqueda de imagenes - escenarios negativos', () => {
  test('IMG-N-01 limit igual a cero es rechazado con mensaje explicito @negativo @critico', async ({
    request,
  }, info) => {
    const r = await llamar(request, info, `/images/search${consulta({ limit: 0 })}`, {
      etiqueta: 'IMG-N-01 limit igual a cero',
    });

    const error = esperarError(r, 400);
    expect(error.error).toBe('Bad Request');
    expect(mensajesDeError(error).join(' ')).toContain('limit must not be less than 1');
  });

  test('IMG-N-02 limit negativo es rechazado @negativo', async ({ request }, info) => {
    const r = await llamar(request, info, `/images/search${consulta({ limit: -5 })}`, {
      etiqueta: 'IMG-N-02 limit negativo',
    });

    const error = esperarError(r, 400);
    expect(mensajesDeError(error).join(' ')).toContain('limit must not be less than 1');
  });

  test('IMG-N-03 limit no numerico es rechazado como entero invalido @negativo', async ({
    request,
  }, info) => {
    const r = await llamar(request, info, `/images/search${consulta({ limit: 'abc' })}`, {
      etiqueta: 'IMG-N-03 limit alfabetico',
    });

    const error = esperarError(r, 400);
    expect(mensajesDeError(error).join(' ')).toContain('limit must be an integer number');
  });

  test('IMG-N-04 limit por encima del maximo declarado es rechazado @negativo @critico', async ({
    request,
  }, info) => {
    const r = await llamar(request, info, `/images/search${consulta({ limit: 101 })}`, {
      etiqueta: 'IMG-N-04 limit por encima del maximo',
    });

    const error = esperarError(r, 400);
    expect(mensajesDeError(error).join(' ')).toContain('limit must not be greater than 100');
  });

  test('IMG-N-05 page negativo es rechazado @negativo', async ({ request }, info) => {
    const r = await llamar(
      request,
      info,
      `/images/search${consulta({ limit: 5, order: 'ASC', page: -1 })}`,
      { etiqueta: 'IMG-N-05 page negativo' }
    );

    const error = esperarError(r, 400);
    expect(mensajesDeError(error).join(' ')).toContain('page must not be less than 0');
  });

  test('IMG-N-06 order fuera del conjunto permitido es rechazado enumerando los validos @negativo @critico', async ({
    request,
  }, info) => {
    const r = await llamar(
      request,
      info,
      `/images/search${consulta({ limit: 2, order: 'SIDEWAYS' })}`,
      { etiqueta: 'IMG-N-06 order invalido' }
    );

    const error = esperarError(r, 400);
    const mensaje = mensajesDeError(error).join(' ');
    expect(
      mensaje,
      'El mensaje debe enumerar los valores validos para que el consumidor pueda corregir'
    ).toContain('ASC, DESC, RANDOM');
  });

  test('IMG-N-07 Un verbo no soportado no se atiende @negativo', async ({ request }, info) => {
    const r = await llamar(request, info, '/images/search', {
      metodo: 'post',
      etiqueta: 'IMG-N-07 verbo POST sobre un recurso de solo lectura',
    });

    expect(
      r.estado,
      'El recurso es de solo lectura y no debe atender una escritura'
    ).toBeGreaterThanOrEqual(400);

    // Comportamiento observado: el servicio responde 404 en lugar de 405.
    // La desviacion queda registrada como hallazgo sin invalidar la ejecucion.
    if (r.estado === 404) {
      info.annotations.push({
        type: 'desviacion',
        description:
          'El servicio responde 404 ante un verbo no soportado. RFC 9110 preve 405 Method Not Allowed con encabezado Allow. Referencia: hallazgo H-07.',
      });
    }
  });

  test('IMG-N-08 Una ruta inexistente devuelve un error estructurado @negativo', async ({
    request,
  }, info) => {
    const r = await llamar(request, info, '/images/busqueda-inexistente', {
      etiqueta: 'IMG-N-08 ruta inexistente',
    });

    const error = esperarError(r, 404);
    expect(error.error).toBe('Not Found');

    const { valido, errores } = validarContrato(esquemaError, error);
    expect(valido, `El cuerpo de error no cumple su contrato: ${errores.join('; ')}`).toBe(true);
  });

  test('IMG-N-09 Los cuerpos de error mantienen una forma uniforme @negativo @contrato', async ({
    request,
  }, info) => {
    const casos = [
      { ruta: `/images/search${consulta({ limit: 0 })}`, estado: 400, nombre: 'limit invalido' },
      {
        ruta: `/images/search${consulta({ limit: 2, order: 'ZZZ' })}`,
        estado: 400,
        nombre: 'order invalido',
      },
      { ruta: '/ruta/que/no/existe', estado: 404, nombre: 'ruta inexistente' },
    ];

    for (const caso of casos) {
      const r = await llamar(request, info, caso.ruta, {
        etiqueta: `IMG-N-09 forma del error: ${caso.nombre}`,
      });
      const error = esperarError(r, caso.estado);

      const { valido, errores } = validarContrato(esquemaError, error);
      expect(
        valido,
        `El error de "${caso.nombre}" no cumple la forma comun: ${errores.join('; ')}`
      ).toBe(true);

      expect(error.path, 'El error debe indicar la ruta solicitada').toBeTruthy();
      expect(
        Date.parse(error.timestamp),
        'La marca de tiempo del error debe ser interpretable'
      ).not.toBeNaN();
    }
  });

  test('IMG-N-10 El error no revela detalle interno de la implementacion @negativo @seguridad', async ({
    request,
  }, info) => {
    const r = await llamar(request, info, `/images/search${consulta({ limit: 'abc' })}`, {
      etiqueta: 'IMG-N-10 fuga de informacion en el error',
    });

    esperarError(r, 400);

    const cuerpo = r.texto.toLowerCase();
    for (const senal of ['stack', 'at object.', 'node_modules', 'sequelize', 'sqlstate', '/usr/']) {
      expect(cuerpo, `El error expone el indicio interno "${senal}"`).not.toContain(senal);
    }
  });
});
