import { createApp } from './app.js';
import { getEnv } from './config/index.js';
import { closeDb } from './db/index.js';
import { getLogger } from './lib/logger.js';

async function startServer(): Promise<void> {
  const env = getEnv();
  const logger = getLogger();
  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info({
      port: env.PORT,
      env: env.NODE_ENV,
      pid: process.pid,
    }, 'Server started');
  });

  async function shutdown(signal: string): Promise<void> {
    logger.info({ signal }, 'Shutting down...');

    server.close(async () => {
      logger.info('HTTP server closed');

      try {
        await closeDb();
        logger.info('Database connections closed');
        process.exit(0);
      } catch (error) {
        logger.error({ error }, 'Error during shutdown');
        process.exit(1);
      }
    });

    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000).unref();
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason: unknown) => {
    logger.error({ reason }, 'Unhandled rejection');
  });

  process.on('uncaughtException', (error: Error) => {
    logger.error({ error }, 'Uncaught exception');
    process.exit(1);
  });
}

startServer().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});