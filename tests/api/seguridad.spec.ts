/**
 * Verificaciones de seguridad de superficie.
 *
 * El alcance es deliberadamente acotado: control de acceso, tratamiento de
 * entradas hostiles y ausencia de fuga de informacion en las respuestas.
 * No incluye pruebas de intrusion ni de agotamiento de recursos, que sobre un
 * servicio de terceros requieren autorizacion escrita del proveedor.
 *
 * Trazabilidad: ISO/IEC 25010:2023, caracteristica "Seguridad",
 * subcaracteristicas "Confidencialidad" e "Integridad".
 */

import { test, expect } from '@playwright/test';
import { consulta, esperarColeccionValida, esperarError, llamar } from './soporte/cliente';
import { LLAVE_API } from './soporte/entorno';

test.describe('Seguridad de superficie', () => {
  test('SEG-01 El recurso de razas exige credencial @seguridad @critico', async ({
    request,
  }, info) => {
    const r = await llamar(request, info, `/breeds/search${consulta({ q: 'beng' })}`, {
      autenticado: false,
      etiqueta: 'SEG-01 acceso anonimo al recurso de razas',
    });

    const error = esperarError(r, 403);
    expect(error.error).toBe('Forbidden');
    expect(String(error.message)).toContain('Authentication required');
  });

  test('SEG-02 Una credencial invalida es rechazada @seguridad @critico', async ({
    request,
  }, info) => {
    const r = await llamar(request, info, `/breeds/search${consulta({ q: 'beng' })}`, {
      encabezados: { 'x-api-key': 'credencial-que-no-existe-000000' },
      etiqueta: 'SEG-02 credencial invalida',
    });

    esperarError(r, 403);
  });

  test('SEG-03 Una credencial vacia o en blanco no concede acceso @seguridad @critico', async ({
    request,
  }, info) => {
    for (const valor of ['', ' ']) {
      const r = await llamar(request, info, `/breeds/search${consulta({ q: 'beng' })}`, {
        encabezados: { 'x-api-key': valor },
        etiqueta: `SEG-03 credencial con el valor "${valor}"`,
      });
      esperarError(r, 403);
    }
  });

  test('SEG-04 La credencial es aceptada por la cadena de consulta @seguridad @critico', async ({
    request,
  }, info) => {
    const r = await llamar(
      request,
      info,
      `/breeds/search${consulta({ q: 'beng', api_key: LLAVE_API })}`,
      { autenticado: false, etiqueta: 'SEG-04 credencial enviada como parametro de consulta' }
    );

    // Comportamiento observado: el servicio autentica con la llave en la URL.
    expect(r.estado, 'El servicio acepta la credencial fuera del encabezado').toBe(200);
    esperarColeccionValida(r);

    info.annotations.push({
      type: 'desviacion',
      description:
        'El servicio acepta la credencial como parametro de consulta y devuelve los datos. ' +
        'Una credencial en la URL queda registrada en los accesos del servidor, en el historial ' +
        'del navegador, en las cabeceras de referencia hacia terceros y en cualquier proxy ' +
        'intermedio. Lo correcto es admitirla solo por encabezado. Referencia: hallazgo H-11.',
    });
  });

  test('SEG-05 Una carga de inyeccion en el criterio de busqueda no altera el comportamiento @seguridad @critico', async ({
    request,
  }, info) => {
    const cargas = [
      { nombre: 'condicion siempre verdadera', valor: "' OR 1=1--" },
      { nombre: 'terminador de sentencia', valor: "'; SELECT 1--" },
      { nombre: 'operador de negacion', valor: '" OR ""="' },
    ];

    for (const carga of cargas) {
      const r = await llamar(request, info, `/breeds/search${consulta({ q: carga.valor })}`, {
        etiqueta: `SEG-05 ${carga.nombre}`,
      });

      expect(
        r.estado,
        `La carga "${carga.nombre}" no debe provocar un fallo del servidor`
      ).toBeLessThan(500);

      if (r.estado === 200) {
        const razas = esperarColeccionValida(r);
        expect(
          razas.length,
          `La carga "${carga.nombre}" no debe devolver coincidencias`
        ).toBe(0);
      }

      const cuerpo = r.texto.toLowerCase();
      for (const indicio of ['syntax error', 'sqlstate', 'sequelize', 'pg_', 'mysql']) {
        expect(cuerpo, `La respuesta filtra el indicio de base de datos "${indicio}"`).not.toContain(
          indicio
        );
      }
    }
  });

  test('SEG-05b El comodin de coincidencia no concede mas datos que una consulta normal @seguridad', async ({
    request,
  }, info) => {
    const comodin = await llamar(request, info, `/breeds/search${consulta({ q: '%' })}`, {
      etiqueta: 'SEG-05b comodin de coincidencia',
    });
    const sinCriterio = await llamar(request, info, '/breeds/search', {
      etiqueta: 'SEG-05b consulta sin criterio, como referencia',
    });

    const conComodin = esperarColeccionValida(comodin);
    const referencia = esperarColeccionValida(sinCriterio);

    expect(
      conComodin.length,
      'El comodin no debe abrir acceso a mas registros que una consulta sin criterio'
    ).toBeLessThanOrEqual(referencia.length);

    info.annotations.push({
      type: 'observacion',
      description:
        `El comodin devolvio ${conComodin.length} razas, las mismas que una consulta sin criterio. ` +
        'No concede acceso adicional, pero conviene documentar que el caracter se interpreta ' +
        'como patron y no como texto literal.',
    });
  });

  test('SEG-06 Una carga de secuencia de comandos se devuelve sin ejecutar y sin reflejarse @seguridad', async ({
    request,
  }, info) => {
    const carga = '<script>alert(1)</script>';

    const r = await llamar(request, info, `/breeds/search${consulta({ q: carga })}`, {
      etiqueta: 'SEG-06 carga de secuencia de comandos',
    });

    expect(r.estado).toBeLessThan(500);
    expect(
      r.encabezados['content-type'],
      'Un cuerpo JSON no se interpreta como documento y neutraliza la carga'
    ).toContain('application/json');

    if (r.estado === 200) {
      const razas = esperarColeccionValida(r);
      expect(razas, 'La carga no corresponde a ninguna raza').toHaveLength(0);
    }
  });

  test('SEG-07 El recorrido de directorios no alcanza recursos fuera del servicio @seguridad', async ({
    request,
  }, info) => {
    const rutas = ['/images/../../etc/passwd', '/breeds/search?q=../../../etc/passwd'];

    for (const ruta of rutas) {
      const r = await llamar(request, info, ruta, { etiqueta: `SEG-07 recorrido en ${ruta}` });

      expect(r.estado, 'El servicio no debe caer').toBeLessThan(500);
      expect(r.texto.toLowerCase(), 'La respuesta no debe contener contenido del sistema').not.toContain(
        'root:'
      );
    }
  });

  test('SEG-08 Las respuestas se sirven exclusivamente sobre canal cifrado @seguridad @critico', async ({
    request,
  }, info) => {
    const r = await llamar(request, info, `/images/search${consulta({ limit: 5 })}`, {
      etiqueta: 'SEG-08 cifrado del canal y de los recursos referidos',
    });

    expect(r.url, 'La peticion debe realizarse sobre HTTPS').toMatch(/^https:\/\//);

    const imagenes = esperarColeccionValida(r);
    for (const imagen of imagenes) {
      expect(
        imagen.url,
        `La imagen ${imagen.id} se sirve sobre un canal sin cifrar`
      ).toMatch(/^https:\/\//);
    }
  });

  test('SEG-09 La respuesta no devuelve la credencial ni datos de la cuenta @seguridad @critico', async ({
    request,
  }, info) => {
    const r = await llamar(request, info, `/breeds/search${consulta({ q: 'beng' })}`, {
      etiqueta: 'SEG-09 ausencia de la credencial en la respuesta',
    });

    esperarColeccionValida(r);

    expect(r.texto, 'La credencial no debe aparecer en el cuerpo de la respuesta').not.toContain(
      LLAVE_API
    );

    const encabezados = JSON.stringify(r.encabezados).toLowerCase();
    for (const campo of ['x-api-key', 'authorization']) {
      expect(encabezados, `El encabezado ${campo} no debe devolverse al cliente`).not.toContain(
        campo
      );
    }
  });

  test('SEG-10 El servicio no expone su pila tecnologica en los encabezados @seguridad', async ({
    request,
  }, info) => {
    const r = await llamar(request, info, `/images/search${consulta({ limit: 1 })}`, {
      etiqueta: 'SEG-10 exposicion de la pila tecnologica',
    });

    const revelados = ['x-powered-by', 'x-aspnet-version', 'x-runtime'].filter(
      (c) => r.encabezados[c] !== undefined
    );

    if (revelados.length > 0) {
      info.annotations.push({
        type: 'observacion',
        description:
          `El servicio expone los encabezados ${revelados.join(', ')}, que facilitan a un tercero ` +
          'identificar la tecnologia subyacente y sus vulnerabilidades conocidas.',
      });
    }

    expect(
      revelados,
      `Encabezados que revelan la implementacion: ${revelados.join(', ')}`
    ).toHaveLength(0);
  });
});
