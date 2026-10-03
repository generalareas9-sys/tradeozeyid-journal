import { loadRepositoryEnvFile } from '../src/config/loadEnvFile.js';

/**
 * Test bootstrap (engineering-contract.md §2, "Test database connection").
 *
 * Runs before every test module is imported:
 *  - `NODE_ENV` is forced to `test`
 *  - `DATABASE_URL` is pointed at `DATABASE_URL_TEST`, so no test can ever
 *    reach the development database
 *  - the harness reads `DATABASE_URL_TEST` only, never `DATABASE_URL`
 */
loadRepositoryEnvFile();

process.env.NODE_ENV = 'test';

const testDatabaseUrl = process.env.DATABASE_URL_TEST;

if (!testDatabaseUrl) {
  throw new Error(
    'DATABASE_URL_TEST must be set to run the backend test suite. It is mandatory in the test environment.',
  );
}

process.env.DATABASE_URL = testDatabaseUrl;