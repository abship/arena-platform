import 'dotenv/config';
import { createApp } from './app.js';
import { createServices } from './services.js';

async function main(): Promise<void> {
  const { appDependencies, port } = await createServices();
  const app = createApp(appDependencies);

  app.listen(port, () => {
    console.log(JSON.stringify({
      action: 'server.start',
      message: 'Arena API server listening',
      port,
    }));
  });
}

void main().catch((error: unknown) => {
  console.error(JSON.stringify({
    action: 'server.start',
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  }));
  process.exit(1);
});
