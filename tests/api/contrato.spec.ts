/**
 * Verificaciones de contrato.
 *
 * Comprueban la forma de las respuestas con independencia de su contenido.
 * Son las pruebas que detectan una ruptura de compatibilidad antes de que la
 * detecten los consumidores del servicio.
 *
 * Trazabilidad: ISO/IEC 25010:2023, caracteristica "Compatibilidad",
 * subcaracteristica "Interoperabilidad".
 */

import { test, expect } from '@playwright/test';
import { consulta, esperarColeccionValida, esperarError, llamar } from './soporte/cliente';
import {
  arregloDe,
  esquemaError,
  esquemaImagenAnonima,
  esquemaImagenAutenticada,
  esquemaRaza,
  validarContrato,
} from './soporte/esquemas';

test.describe('Contrato de las respuestas', () => {
  test('CTR-01 La representacion anonima de una imagen cumple el contrato reducido @contrato @critico', async ({
    request,
  }, info) => {
    const r = await llamar(request, info, `/images/search${consulta({ limit: 10 })}`, {
      autenticado: false,
      etiqueta: 'CTR-01 contrato de la representacion anonima',
    });

    const imagenes = esperarColeccionValida(r);
    const { valido, errores } = validarContrato(arregloDe(esquemaImagenAnonima), imagenes);
    expect(valido, `Desviaciones: ${errores.join('; ')}`).toBe(true);
  });

  test('CTR-02 La representacion autenticada de una imagen cumple el contrato extendido @contrato @critico', async ({
    request,
  }, info) => {
    const r = await llamar(request, info, `/images/search${consulta({ limit: 10 })}`, {
      etiqueta: 'CTR-02 contrato de la representacion autenticada',
    });

    const imagenes = esperarColeccionValida(r);
    const { valido, errores } = validarContrato(arregloDe(esquemaImagenAutenticada), imagenes);
    expect(valido, `Desviaciones: ${errores.join('; ')}`).toBe(true);
  });

  test('CTR-03 La representacion cambia segun la credencial del consumidor @contrato @critico', async ({
    request,
  }, info) => {
    const anonimo = await llamar(request, info, `/images/search${consulta({ limit: 1 })}`, {
      autenticado: false,
      etiqueta: 'CTR-03 lectura anonima',
    });
    const autenticado = await llamar(request, info, `/images/search${consulta({ limit: 1 })}`, {
      etiqueta: 'CTR-03 lectura autenticada',
    });

    const camposAnonimos = Object.keys(esperarColeccionValida(anonimo)[0]).sort();
    const camposAutenticados = Object.keys(esperarColeccionValida(autenticado)[0]).sort();

    const soloAutenticados = camposAutenticados.filter((c) => !camposAnonimos.includes(c));

    info.annotations.push({
      type: 'observacion',
      description:
        `Representacion anonima: ${camposAnonimos.join(', ')}. ` +
        `Representacion autenticada: ${camposAutenticados.join(', ')}. ` +
        `Campos exclusivos del consumidor autenticado: ${soloAutenticados.join(', ') || 'ninguno'}. ` +
        'El mismo recurso expone dos contratos distintos segun la credencial, y la especificacion ' +
        'no lo advierte. Toda validacion de esquema debe fijar el modo de autenticacion o fallara ' +
        'de forma intermitente. Referencia: hallazgo H-09.',
    });

    // El contrato minimo debe sostenerse en ambos modos: es la garantia que
    // todo consumidor puede dar por cierta.
    for (const campo of ['id', 'url', 'width', 'height']) {
      expect(camposAnonimos, `El campo ${campo} debe existir en la lectura anonima`).toContain(
        campo
      );
      expect(
        camposAutenticados,
        `El campo ${campo} debe existir en la lectura autenticada`
      ).toContain(campo);
    }
  });

  test('CTR-04 La coleccion de razas cumple su contrato @contrato @critico', async ({
    request,
  }, info) => {
    const r = await llamar(request, info, `/breeds/search${consulta({ q: 'a' })}`, {
      etiqueta: 'CTR-04 contrato de la coleccion de razas',
    });

    const razas = esperarColeccionValida(r);
    const { valido, errores } = validarContrato(arregloDe(esquemaRaza), razas);
    expect(valido, `Desviaciones: ${errores.join('; ')}`).toBe(true);
  });

  test('CTR-05 Todo error responde con la misma estructura @contrato @critico', async ({
    request,
  }, info) => {
    const casos = [
      { nombre: 'validacion de limit', ruta: `/images/search${consulta({ limit: 0 })}`, estado: 400 },
      { nombre: 'validacion de q', ruta: '/breeds/search?q=', estado: 400 },
      { nombre: 'ruta inexistente', ruta: '/recurso/inexistente', estado: 404 },
    ];

    for (const caso of casos) {
      const r = await llamar(request, info, caso.ruta, {
        etiqueta: `CTR-05 estructura del error: ${caso.nombre}`,
      });
      const error = esperarError(r, caso.estado);
      const { valido, errores } = validarContrato(esquemaError, error);
      expect(valido, `El error de "${caso.nombre}" se desvia: ${errores.join('; ')}`).toBe(true);
    }
  });

  test('CTR-06 El tipo de contenido declarado corresponde al cuerpo entregado @contrato', async ({
    request,
  }, info) => {
    const rutas = [
      `/images/search${consulta({ limit: 1 })}`,
      `/breeds/search${consulta({ q: 'beng' })}`,
      `/images/search${consulta({ limit: 0 })}`,
    ];

    for (const ruta of rutas) {
      const r = await llamar(request, info, ruta, { etiqueta: `CTR-06 tipo de contenido en ${ruta}` });
      expect(
        r.encabezados['content-type'],
        `La ruta ${ruta} debe declarar JSON`
      ).toContain('application/json');
      expect(
        () => JSON.parse(r.texto),
        `La ruta ${ruta} declara JSON pero el cuerpo no lo es`
      ).not.toThrow();
    }
  });

  test('CTR-07 El campo de mensaje del error admite dos formas distintas @contrato', async ({
    request,
  }, info) => {
    const validacion = await llamar(request, info, `/images/search${consulta({ limit: 0 })}`, {
      etiqueta: 'CTR-07 mensaje en un error de validacion',
    });
    const noEncontrado = await llamar(request, info, '/recurso/inexistente', {
      etiqueta: 'CTR-07 mensaje en un error de ruta',
    });

    const mensajeValidacion = esperarError(validacion, 400).message;
    const mensajeNoEncontrado = esperarError(noEncontrado, 404).message;

    expect(Array.isArray(mensajeValidacion), 'La validacion agrupa varios mensajes en un arreglo').toBe(
      true
    );
    expect(typeof mensajeNoEncontrado, 'El error de ruta entrega una sola cadena').toBe('string');

    info.annotations.push({
      type: 'observacion',
      description:
        'El campo message es un arreglo en los errores 400 y una cadena en los 403 y 404. Un ' +
        'cliente que lo trate siempre igual fallara al mostrar el mensaje. Referencia: hallazgo H-10.',
    });
  });
});
