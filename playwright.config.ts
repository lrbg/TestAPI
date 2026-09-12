import { defineConfig } from '@playwright/test';

/**
 * Configuracion de la suite de pruebas de API.
 *
 * La suite no abre navegador: se apoya unicamente en el contexto de peticiones
 * de Playwright, lo que la vuelve rapida y estable en integracion continua.
 *
 * Trazabilidad: ISO/IEC/IEEE 29119-3, elemento "Test Environment Requirements".
 */

const ES_CI = !!process.env.CI;

export default defineConfig({
  testDir: './tests/api',
  outputDir: './resultados/artefactos',
  /* El API es un servicio de terceros: la ejecucion en serie por archivo evita
     saturarlo y mantiene los tiempos de respuesta medidos libres de ruido. */
  fullyParallel: false,
  workers: ES_CI ? 2 : 4,
  /* Un reintento absorbe la intermitencia de red propia de un servicio externo
     sin ocultar fallos reproducibles: si falla dos veces, es un hallazgo real. */
  retries: ES_CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  forbidOnly: ES_CI,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'resultados/playwright-html', open: 'never' }],
    ['json', { outputFile: 'resultados/playwright.json' }],
    ['junit', { outputFile: 'resultados/junit.xml' }],
  ],
  use: {
    baseURL: process.env.URL_BASE_API ?? 'https://api.thecatapi.com/v1',
    extraHTTPHeaders: {
      Accept: 'application/json',
    },
    ignoreHTTPSErrors: false,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'api',
      testMatch: /.*\.spec\.ts/,
    },
  ],
});
