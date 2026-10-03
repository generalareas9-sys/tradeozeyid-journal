import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * `.env` lives at the repository root. The path is resolved relative to this
 * module so loading does not depend on the current working directory, and
 * variables already present in the environment always win — which is what keeps
 * test stubs and CI-provided values authoritative.
 */
const repositoryEnvFile = fileURLToPath(new URL('../../../.env', import.meta.url));

export function loadRepositoryEnvFile(): void {
  if (existsSync(repositoryEnvFile)) {
    process.loadEnvFile(repositoryEnvFile);
  }
}