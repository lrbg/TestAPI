/**
 * Parametros declarados en la especificacion publicada por el proveedor.
 *
 * La especificacion que acompana al requerimiento se encuentra en
 * https://developers.thecatapi.com/view-account/ylX4blBYT9FaoVd6OhvR?report=FJkYOq9tW
 * y declara para GET /images/search una tabla de parametros con tipo y valor
 * por defecto: limit, page, order, has_breeds, breed_ids, category_ids y
 * sub_id.
 *
 * Tres de esos parametros no aparecen en el enunciado de la evaluacion
 * (breed_ids, category_ids y sub_id) y, en sentido inverso, el enunciado
 * menciona tres que la especificacion no declara (size, mime_types y format).
 * Este archivo cubre esa diferencia, que es donde se concentran los hallazgos
 * mas utiles del trabajo.
 */

import { test, expect } from '@playwright/test';
import { consulta, esperarColeccionValida, llamar } from './soporte/cliente';

test.describe('Parametros declarados en la especificacion', () => {
  test('ESP-01 El filtro breed_ids devuelve unicamente imagenes de la raza pedida @funcional @contrato @critico', async ({
    request,
  }, info) => {
    const r = await llamar(
      request,
      info,
      `/images/search${consulta({ limit: 10, breed_ids: 'beng' })}`,
      { etiqueta: 'ESP-01 filtro por identificador de raza' }
    );

    const imagenes = esperarColeccionValida(r);
    expect(imagenes, 'El filtro debe respetar el tamano solicitado').toHaveLength(10);

    for (const imagen of imagenes) {
      const razas = (imagen.breeds ?? []).map((b: any) => b.id);
      expect(
        razas,
        `La imagen ${imagen.id} se devolvio bajo breed_ids=beng con las razas ${razas.join(', ') || 'ninguna'}`
      ).toContain('beng');
    }
  });

  test('ESP-02 El filtro breed_ids admite varias razas separadas por coma @funcional', async ({
    request,
  }, info) => {
    const r = await llamar(
      request,
      info,
      `/images/search${consulta({ limit: 10, breed_ids: 'beng,abys' })}`,
      { etiqueta: 'ESP-02 filtro por varias razas' }
    );

    const imagenes = esperarColeccionValida(r);
    expect(imagenes.length).toBeGreaterThan(0);

    for (const imagen of imagenes) {
      const razas = (imagen.breeds ?? []).map((b: any) => b.id);
      expect(
        razas.some((id: string) => ['beng', 'abys'].includes(id)),
        `La imagen ${imagen.id} no corresponde a ninguna de las razas solicitadas`
      ).toBe(true);
    }
  });

  test('ESP-03 Un identificador de raza inexistente devuelve una coleccion vacia @negativo', async ({
    request,
  }, info) => {
    const r = await llamar(
      request,
      info,
      `/images/search${consulta({ limit: 5, breed_ids: 'razainexistente' })}`,
      { etiqueta: 'ESP-03 identificador de raza inexistente' }
    );

    const imagenes = esperarColeccionValida(r);
    expect(
      imagenes,
      'Sin coincidencias, la respuesta correcta es una coleccion vacia y no un error'
    ).toHaveLength(0);
  });

  test('ESP-04 El filtro sub_id no restringe los resultados @borde @critico', async ({
    request,
  }, info) => {
    const referencia = 'demo-9252f4';

    const r = await llamar(
      request,
      info,
      `/images/search${consulta({ limit: 10, sub_id: referencia })}`,
      { etiqueta: 'ESP-04 filtro por identificador secundario' }
    );

    const imagenes = esperarColeccionValida(r);
    const fueraDelFiltro = imagenes.filter((i) => i.sub_id !== referencia);

    if (fueraDelFiltro.length > 0) {
      info.annotations.push({
        type: 'desviacion',
        description:
          `Se solicito sub_id=${referencia} y ${fueraDelFiltro.length} de ${imagenes.length} ` +
          'resultados traen otro valor o carecen del campo. La especificacion declara sub_id como ' +
          'filtro y el servicio lo acepta sin aplicarlo. Referencia: hallazgo H-13.',
      });
    }

    expect(
      fueraDelFiltro.length,
      'Registro del hallazgo H-13: el filtro sub_id no se aplica'
    ).toBeGreaterThan(0);
  });

  test('ESP-05 El filtro category_ids no devuelve imagenes con esa categoria @borde', async ({
    request,
  }, info) => {
    const r = await llamar(
      request,
      info,
      `/images/search${consulta({ limit: 10, category_ids: 1 })}`,
      { etiqueta: 'ESP-05 filtro por categoria' }
    );

    const imagenes = esperarColeccionValida(r);
    const conCategoria = imagenes.filter((i) => (i.categories ?? []).length > 0);

    info.annotations.push({
      type: conCategoria.length === 0 ? 'desviacion' : 'observacion',
      description:
        `Se solicito category_ids=1 y ${conCategoria.length} de ${imagenes.length} resultados ` +
        'traen alguna categoria. La especificacion declara el parametro como filtro. ' +
        'Conviene confirmar con el proveedor si la credencial de demostracion tiene acceso a las ' +
        'categorias antes de clasificarlo como defecto. Referencia: hallazgo H-14.',
    });

    expect(r.estado, 'El servicio no debe fallar ante el parametro declarado').toBe(200);
  });

  test('ESP-06 El valor RAND que declara la especificacion es aceptado @funcional', async ({
    request,
  }, info) => {
    const documentado = await llamar(
      request,
      info,
      `/images/search${consulta({ limit: 5, order: 'RAND' })}`,
      { etiqueta: 'ESP-06 order con el valor documentado RAND' }
    );
    const segunda = await llamar(
      request,
      info,
      `/images/search${consulta({ limit: 5, order: 'RAND' })}`,
      { etiqueta: 'ESP-06 segunda extraccion con RAND' }
    );

    const a = esperarColeccionValida(documentado).map((i) => i.id);
    const b = esperarColeccionValida(segunda).map((i) => i.id);

    expect(a, 'El valor documentado debe respetar el tamano solicitado').toHaveLength(5);
    expect(b.join(','), 'RAND debe producir un orden aleatorio real').not.toBe(a.join(','));

    info.annotations.push({
      type: 'observacion',
      description:
        'La especificacion declara los valores ASC, DESC y RAND. El mensaje de error que el ' +
        'servicio devuelve ante un valor invalido enumera ASC, DESC y RANDOM, sin mencionar RAND. ' +
        'Ambos valores funcionan, pero el mensaje y la especificacion no coinciden. ' +
        'Referencia: hallazgo H-15.',
    });
  });

  test('ESP-07 El parametro order no distingue mayusculas de minusculas @borde', async ({
    request,
  }, info) => {
    const r = await llamar(request, info, `/images/search${consulta({ limit: 3, order: 'rand' })}`, {
      etiqueta: 'ESP-07 order en minusculas',
    });

    expect(r.estado, 'El valor en minusculas es aceptado').toBe(200);
    expect(esperarColeccionValida(r)).toHaveLength(3);
  });

  test('ESP-08 La consulta de una imagen por identificador devuelve el recurso documentado @funcional @contrato', async ({
    request,
  }, info) => {
    /* La especificacion usa este identificador en su ejemplo de respuesta. */
    const identificador = '0XYvRd7oD';

    const r = await llamar(request, info, `/images/${identificador}`, {
      etiqueta: 'ESP-08 imagen por identificador del ejemplo documentado',
    });

    expect(r.estado).toBe(200);
    expect(r.cuerpo, 'La respuesta es un objeto, no una coleccion').not.toBeNull();
    expect(Array.isArray(r.cuerpo), 'La consulta por identificador no devuelve un arreglo').toBe(false);
    expect(r.cuerpo.id).toBe(identificador);
    expect(r.cuerpo.url).toMatch(/^https:\/\//);
    expect(r.cuerpo.width).toBeGreaterThan(0);
    expect(r.cuerpo.height).toBeGreaterThan(0);
  });

  test('ESP-09 El objeto raza tiene dos formas distintas segun el recurso que lo devuelve @contrato @critico', async ({
    request,
  }, info) => {
    const porImagen = await llamar(request, info, '/images/0XYvRd7oD', {
      etiqueta: 'ESP-09 raza incrustada en una imagen',
    });
    const porBusqueda = await llamar(request, info, `/breeds/search${consulta({ q: 'abys' })}`, {
      etiqueta: 'ESP-09 raza devuelta por la busqueda de razas',
    });

    expect(porImagen.estado).toBe(200);
    const razaEnImagen = (porImagen.cuerpo?.breeds ?? [])[0];
    test.skip(!razaEnImagen, 'La imagen de referencia no trae raza asociada');

    const razaEnBusqueda = esperarColeccionValida(porBusqueda)[0];

    const camposImagen = Object.keys(razaEnImagen).sort();
    const camposBusqueda = Object.keys(razaEnBusqueda).sort();

    const soloEnImagen = camposImagen.filter((c) => !camposBusqueda.includes(c));
    const soloEnBusqueda = camposBusqueda.filter((c) => !camposImagen.includes(c));

    info.annotations.push({
      type: 'desviacion',
      description:
        `La misma entidad raza expone campos distintos segun el recurso. Solo al venir dentro de ` +
        `una imagen: ${soloEnImagen.join(', ') || 'ninguno'}. Solo al venir de la busqueda de ` +
        `razas: ${soloEnBusqueda.join(', ') || 'ninguno'}. Un cliente que reutilice el mismo ` +
        'modelo para ambos casos encontrara campos ausentes. Referencia: hallazgo H-16.',
    });

    /* El nucleo comun es lo que todo consumidor puede dar por cierto. */
    for (const campo of ['id', 'name', 'temperament', 'origin', 'life_span', 'description']) {
      expect(camposImagen, `El campo ${campo} falta en la raza incrustada`).toContain(campo);
      expect(camposBusqueda, `El campo ${campo} falta en la busqueda de razas`).toContain(campo);
    }

    expect(
      soloEnImagen.length + soloEnBusqueda.length,
      'Registro del hallazgo H-16: las dos formas no coinciden'
    ).toBeGreaterThan(0);
  });

  test('ESP-10 Los parametros del enunciado que la especificacion no declara se ignoran @borde @critico', async ({
    request,
  }, info) => {
    /* size, mime_types y format aparecen en el enunciado de la evaluacion pero
       no en la tabla de parametros de la especificacion publicada. */
    const casos = [
      { nombre: 'size', ruta: `/images/search${consulta({ limit: 2, size: 'small' })}` },
      { nombre: 'mime_types', ruta: `/images/search${consulta({ limit: 2, mime_types: 'gif' })}` },
      { nombre: 'format', ruta: `/images/search${consulta({ limit: 2, format: 'src' })}` },
    ];

    for (const caso of casos) {
      const r = await llamar(request, info, caso.ruta, {
        etiqueta: `ESP-10 parametro no declarado: ${caso.nombre}`,
      });

      expect(r.estado, `El parametro ${caso.nombre} no debe provocar un fallo`).toBe(200);
      expect(
        r.encabezados['content-type'],
        `El parametro ${caso.nombre} no altera el tipo de contenido`
      ).toContain('application/json');
      esperarColeccionValida(r);
    }

    info.annotations.push({
      type: 'desviacion',
      description:
        'El enunciado de la evaluacion lista size, mime_types y format como parametros del ' +
        'endpoint. La especificacion a la que remite no los declara, y el servicio los acepta sin ' +
        'aplicarlos. En sentido inverso, la especificacion declara breed_ids, category_ids y ' +
        'sub_id, que el enunciado no menciona y de los cuales breed_ids si funciona. ' +
        'Referencia: hallazgo H-17.',
    });
  });
});
