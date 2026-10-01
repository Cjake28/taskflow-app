import 'dotenv/config';
import { createContainer } from './container';

/** Standalone worker process: `npm run worker` (set RUN_WORKER_IN_API=false for the API). */
const container = await createContainer();
await container.startWorkers();
container.logger.info('Worker process ready');

let shuttingDown = false;
function shutdown(reason: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  container.logger.info({ reason }, 'Worker shutting down');
  void container.close().finally(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  container.logger.fatal({ err: reason }, 'Unhandled promise rejection');
  shutdown('unhandledRejection');
});
process.on('uncaughtException', (err) => {
  container.logger.fatal({ err }, 'Uncaught exception');
  shutdown('uncaughtException');
});
