/**
 * Configuracion del entorno de pruebas.
 *
 * Concentra en un solo lugar la URL base, la credencial y los umbrales de
 * desempeno, de modo que el mismo codigo de prueba pueda apuntar a distintos
 * entornos sin modificaciones.
 */

export const URL_BASE = process.env.URL_BASE_API ?? 'https://api.thecatapi.com/v1';

/**
 * TheCatAPI publica la credencial de demostracion "DEMO-API-KEY" para uso
 * abierto. Se toma como valor por defecto para que la suite sea ejecutable sin
 * configuracion previa; en un entorno formal debe sustituirse por una llave
 * propia mediante el secreto CAT_API_KEY, porque los limites de consumo de la
 * credencial de demostracion son compartidos por todos sus usuarios.
 *
 * Importante: cuando un flujo de integracion continua referencia un secreto que
 * no existe, la variable llega definida y vacia, no ausente. Por eso se
 * descarta tambien la cadena vacia y los espacios en blanco; usar el operador
 * de fusion de nulos dejaria pasar una llave vacia y todas las peticiones
 * autenticadas responderian 403.
 */
const LLAVE_CONFIGURADA = (process.env.CAT_API_KEY ?? '').trim();

export const LLAVE_API = LLAVE_CONFIGURADA || 'DEMO-API-KEY';

/** Indica si la llave en uso es la de demostracion publica. */
export const USA_LLAVE_DEMO = LLAVE_CONFIGURADA.length === 0;

/** Encabezados para las peticiones autenticadas. */
export const ENCABEZADOS_AUTENTICADOS = {
  'x-api-key': LLAVE_API,
  Accept: 'application/json',
};

/** Encabezados para las peticiones anonimas. */
export const ENCABEZADOS_ANONIMOS = {
  Accept: 'application/json',
};

/**
 * Umbrales de desempeno para las verificaciones no funcionales ejecutadas
 * dentro de la suite funcional. Son deliberadamente holgados: su proposito es
 * detectar degradaciones graves, no medir capacidad. La medicion formal de
 * desempeno vive en la suite de k6.
 *
 * Trazabilidad: ISO/IEC 25010:2023, caracteristica "Eficiencia de desempeno",
 * subcaracteristica "Comportamiento temporal".
 */
export const UMBRALES = {
  /** Tiempo maximo aceptable para una respuesta individual, en milisegundos. */
  respuestaMaximaMs: Number(process.env.UMBRAL_RESPUESTA_MS ?? 3000),
  /** Tiempo objetivo de respuesta para las rutas criticas, en milisegundos. */
  respuestaObjetivoMs: Number(process.env.UMBRAL_OBJETIVO_MS ?? 1500),
};

/**
 * Limite de resultados que el servicio entrega a un consumidor anonimo,
 * con independencia del valor solicitado en el parametro limit.
 * Valor observado durante el relevamiento del servicio.
 */
export const TOPE_ANONIMO = 10;

/** Rango declarado por el servicio para el parametro limit. */
export const RANGO_LIMIT = { minimo: 1, maximo: 100 };

/** Rango declarado por el servicio para el parametro q de busqueda de razas. */
export const RANGO_Q = { minimo: 1, maximo: 30 };

/** Valores aceptados por el parametro order. */
export const VALORES_ORDER = ['ASC', 'DESC', 'RANDOM'] as const;

/** Razas de referencia usadas como datos de prueba estables. */
export const RAZAS_REFERENCIA = [
  { consulta: 'beng', id: 'beng', nombre: 'Bengal' },
  { consulta: 'siam', id: 'siam', nombre: 'Siamese' },
  { consulta: 'maine coon', id: 'mcoo', nombre: 'Maine Coon' },
  { consulta: 'abys', id: 'abys', nombre: 'Abyssinian' },
];
