/**
 * Ejercicio 2 - GET /breeds/search
 * Escenarios funcionales: busqueda de razas por nombre.
 *
 * A diferencia del recurso de imagenes, este devuelve datos de referencia
 * estables, lo que permite verificar contenido concreto y no solo invariantes.
 */

import { test, expect } from '@playwright/test';
import { consulta, esperarColeccionValida, llamar } from './soporte/cliente';
import { RAZAS_REFERENCIA, UMBRALES } from './soporte/entorno';
import { arregloDe, esquemaRaza, validarContrato } from './soporte/esquemas';

test.describe('Busqueda de razas - escenarios funcionales', () => {
  test('BRD-F-01 Una consulta conocida devuelve la raza correspondiente @funcional @critico', async ({
    request,
  }, info) => {
    const r = await llamar(request, info, `/breeds/search${consulta({ q: 'beng' })}`, {
      etiqueta: 'BRD-F-01 busqueda de la raza Bengal',
    });

    const razas = esperarColeccionValida(r);
    expect(razas, 'La consulta "beng" identifica una sola raza').toHaveLength(1);
    expect(razas[0].id).toBe('beng');
    expect(razas[0].name).toBe('Bengal');
    expect(r.duracionMs).toBeLessThan(UMBRALES.respuestaMaximaMs);
  });

  test('BRD-F-02 Las razas de referencia se recuperan de forma consistente @funcional @critico', async ({
    request,
  }, info) => {
    for (const raza of RAZAS_REFERENCIA) {
      const r = await llamar(
        request,
        info,
        `/breeds/search${consulta({ q: raza.consulta })}`,
        { etiqueta: `BRD-F-02 busqueda de ${raza.nombre}` }
      );

      const resultados = esperarColeccionValida(r);
      const encontrada = resultados.find((x) => x.id === raza.id);
      expect(
        encontrada,
        `La consulta "${raza.consulta}" debe devolver la raza ${raza.nombre}`
      ).toBeTruthy();
      expect(encontrada.name).toBe(raza.nombre);
    }
  });

  test('BRD-F-03 La busqueda es insensible a mayusculas y minusculas @funcional', async ({
    request,
  }, info) => {
    const variantes = ['bengal', 'BENGAL', 'BeNgAl'];
    const resultados: string[][] = [];

    for (const variante of variantes) {
      const r = await llamar(request, info, `/breeds/search${consulta({ q: variante })}`, {
        etiqueta: `BRD-F-03 variante de escritura "${variante}"`,
      });
      resultados.push(esperarColeccionValida(r).map((x) => x.id));
    }

    for (const ids of resultados) {
      expect(ids, 'Toda variante de escritura debe encontrar la misma raza').toContain('beng');
    }
    expect(
      new Set(resultados.map((r) => r.join(','))).size,
      'Las tres variantes deben producir un resultado identico'
    ).toBe(1);
  });

  test('BRD-F-04 Una consulta con espacio encuentra razas de nombre compuesto @funcional', async ({
    request,
  }, info) => {
    const r = await llamar(request, info, `/breeds/search${consulta({ q: 'maine coon' })}`, {
      etiqueta: 'BRD-F-04 nombre compuesto con espacio',
    });

    const razas = esperarColeccionValida(r);
    expect(razas.length).toBeGreaterThan(0);
    expect(razas[0].id).toBe('mcoo');
    expect(razas[0].name).toBe('Maine Coon');
  });

  test('BRD-F-05 Una coincidencia parcial devuelve todas las razas que la contienen @funcional', async ({
    request,
  }, info) => {
    const r = await llamar(request, info, `/breeds/search${consulta({ q: 'american' })}`, {
      etiqueta: 'BRD-F-05 coincidencia parcial',
    });

    const razas = esperarColeccionValida(r);
    expect(razas.length, 'Varias razas contienen el termino buscado').toBeGreaterThan(1);

    for (const raza of razas) {
      expect(
        String(raza.name).toLowerCase(),
        `La raza ${raza.name} no contiene el termino buscado`
      ).toContain('american');
    }
  });

  test('BRD-F-06 Una raza expone la informacion descriptiva que la hace util @funcional @critico', async ({
    request,
  }, info) => {
    const r = await llamar(request, info, `/breeds/search${consulta({ q: 'siam' })}`, {
      etiqueta: 'BRD-F-06 campos descriptivos de la raza',
    });

    const razas = esperarColeccionValida(r);
    const raza = razas[0];

    expect(raza.id, 'Identificador').toBeTruthy();
    expect(raza.name, 'Nombre').toBeTruthy();
    expect(raza.description, 'Descripcion').toBeTruthy();
    expect(raza.temperament, 'Temperamento').toBeTruthy();
    expect(raza.origin, 'Origen').toBeTruthy();
    expect(raza.life_span, 'Esperanza de vida').toMatch(/\d+\s*-\s*\d+/);
  });

  test('BRD-F-07 La coleccion de razas cumple su contrato @funcional @contrato @critico', async ({
    request,
  }, info) => {
    const r = await llamar(request, info, `/breeds/search${consulta({ q: 'a' })}`, {
      etiqueta: 'BRD-F-07 contrato de la coleccion de razas',
    });

    const razas = esperarColeccionValida(r);
    expect(razas.length).toBeGreaterThan(0);

    const { valido, errores } = validarContrato(arregloDe(esquemaRaza), razas);
    expect(valido, `Desviaciones de contrato: ${errores.join('; ')}`).toBe(true);
  });

  test('BRD-F-08 La informacion de imagen asociada es utilizable cuando esta presente @funcional', async ({
    request,
  }, info) => {
    const r = await llamar(
      request,
      info,
      `/breeds/search${consulta({ q: 'siam', attach_image: 1 })}`,
      { etiqueta: 'BRD-F-08 imagen asociada a la raza' }
    );

    const razas = esperarColeccionValida(r);
    const raza = razas[0];

    test.skip(!raza.image, 'La raza consultada no tiene imagen de referencia asociada');

    expect(raza.image.url, 'La imagen asociada debe servirse sobre HTTPS').toMatch(/^https:\/\//);
    expect(raza.image.width).toBeGreaterThan(0);
    expect(raza.image.height).toBeGreaterThan(0);

    if (raza.reference_image_id) {
      expect(
        raza.image.id,
        'La imagen adjunta debe corresponder a la imagen de referencia declarada'
      ).toBe(raza.reference_image_id);
    }
  });

  test('BRD-F-09 La busqueda es estable ante peticiones repetidas @funcional', async ({
    request,
  }, info) => {
    const ruta = `/breeds/search${consulta({ q: 'beng' })}`;

    const primera = await llamar(request, info, ruta, { etiqueta: 'BRD-F-09 primera lectura' });
    const segunda = await llamar(request, info, ruta, { etiqueta: 'BRD-F-09 segunda lectura' });

    const a = esperarColeccionValida(primera);
    const b = esperarColeccionValida(segunda);

    expect(
      JSON.stringify(b),
      'Un catalogo de referencia debe ser identico entre lecturas consecutivas'
    ).toBe(JSON.stringify(a));
  });

  test('BRD-F-10 La omision del parametro de busqueda devuelve un listado general @funcional', async ({
    request,
  }, info) => {
    const r = await llamar(request, info, '/breeds/search', {
      etiqueta: 'BRD-F-10 consulta sin parametro de busqueda',
    });

    const razas = esperarColeccionValida(r);
    expect(
      razas.length,
      'Sin criterio de busqueda el servicio devuelve un listado, no un error'
    ).toBeGreaterThan(0);

    info.annotations.push({
      type: 'observacion',
      description:
        'Omitir q devuelve un listado general, mientras que enviar q vacio devuelve 400. Dos ' +
        'formas de "no buscar nada" producen respuestas opuestas. Referencia: hallazgo H-08.',
    });
  });
});
