/**
 * Contratos de respuesta expresados como esquemas JSON.
 *
 * El servicio entrega representaciones distintas segun el consumidor este
 * autenticado o no. Por eso se declaran dos contratos para el recurso de
 * imagenes en lugar de uno solo: verificar ambos es precisamente lo que
 * evidencia la variacion.
 *
 * Trazabilidad: ISO/IEC 25010:2023, caracteristica "Adecuacion funcional",
 * subcaracteristica "Correccion funcional"; y "Compatibilidad",
 * subcaracteristica "Interoperabilidad".
 */

import Ajv, { type ValidateFunction } from 'ajv';
import agregarFormatos from 'ajv-formats';

const ajv = new Ajv({ allErrors: true, strict: false });
agregarFormatos(ajv);

/** Representacion de una imagen para un consumidor anonimo. */
export const esquemaImagenAnonima = {
  type: 'object',
  required: ['id', 'url', 'width', 'height'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1 },
    url: { type: 'string', format: 'uri', pattern: '^https://' },
    width: { type: 'integer', exclusiveMinimum: 0 },
    height: { type: 'integer', exclusiveMinimum: 0 },
  },
};

/** Representacion de una imagen para un consumidor autenticado. */
export const esquemaImagenAutenticada = {
  type: 'object',
  required: ['id', 'url', 'width', 'height'],
  additionalProperties: true,
  properties: {
    id: { type: 'string', minLength: 1 },
    url: { type: 'string', format: 'uri', pattern: '^https://' },
    width: { type: 'integer', exclusiveMinimum: 0 },
    height: { type: 'integer', exclusiveMinimum: 0 },
    created_at: { type: 'string' },
    breeds: { type: 'array' },
    categories: { type: 'array' },
    colours: { type: ['array', 'null'] },
    tags: { type: ['array', 'null'] },
    sub_id: { type: ['string', 'null'] },
  },
};

/** Representacion de una raza. */
export const esquemaRaza = {
  type: 'object',
  required: ['id', 'name', 'temperament', 'origin', 'life_span', 'description'],
  additionalProperties: true,
  properties: {
    id: { type: 'string', minLength: 1 },
    name: { type: 'string', minLength: 1 },
    species_id: { type: ['string', 'number', 'null'] },
    life_span: { type: 'string', minLength: 1 },
    temperament: { type: 'string', minLength: 1 },
    origin: { type: 'string', minLength: 1 },
    country_codes: { type: ['string', 'null'] },
    country_code: { type: ['string', 'null'] },
    description: { type: 'string', minLength: 1 },
    reference_image_id: { type: ['string', 'null'] },
    weight: { type: ['object', 'null'] },
    image: {
      type: ['object', 'null'],
      properties: {
        id: { type: 'string' },
        url: { type: 'string', format: 'uri' },
        width: { type: 'integer' },
        height: { type: 'integer' },
      },
    },
  },
};

/**
 * Cuerpo de error del servicio. Observado de forma consistente en las
 * respuestas 400, 403 y 404.
 */
export const esquemaError = {
  type: 'object',
  required: ['statusCode', 'timestamp', 'path', 'message', 'error'],
  additionalProperties: true,
  properties: {
    statusCode: { type: 'integer' },
    timestamp: { type: 'string' },
    path: { type: 'string' },
    // El servicio usa cadena para 403 y 404, y arreglo de cadenas para 400.
    message: {
      oneOf: [{ type: 'string', minLength: 1 }, { type: 'array', items: { type: 'string' } }],
    },
    error: { type: 'string', minLength: 1 },
  },
};

/** Envoltura de arreglo para cualquier esquema de elemento. */
export const arregloDe = (esquemaElemento: object) => ({
  type: 'array',
  items: esquemaElemento,
});

const cache = new Map<string, ValidateFunction>();

/**
 * Valida un cuerpo contra un esquema y devuelve un resultado legible.
 * No lanza excepciones: el llamador decide como reportar la desviacion.
 */
export function validarContrato(
  esquema: object,
  cuerpo: unknown
): { valido: boolean; errores: string[] } {
  const clave = JSON.stringify(esquema);
  let validar = cache.get(clave);
  if (!validar) {
    validar = ajv.compile(esquema);
    cache.set(clave, validar);
  }
  const valido = validar(cuerpo) as boolean;
  const errores = (validar.errors ?? []).map(
    (e) => `${e.instancePath || '(raiz)'} ${e.message ?? ''}`.trim()
  );
  return { valido, errores };
}
