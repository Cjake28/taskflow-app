import 'dotenv/config';
import { createApp } from './app';
import { createContainer } from './container';

const container = await createContainer();
const app = createApp(container);

const server = app.listen(container.env.PORT, () => {
  container.logger.info(`API listening on http://localhost:${container.env.PORT}`);
});

let shuttingDown = false;
function shutdown(reason: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  container.logger.info({ reason }, 'Shutting down');
  server.close(() => {
    void container.close().finally(() => process.exit(0));
  });
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
