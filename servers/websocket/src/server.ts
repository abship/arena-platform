import { createServer } from 'node:http';
import { GameInstanceHost, StateBroadcaster } from '@arena/game-server';
import { createWebsocketGateway } from './gateway.js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function parsePort(value: string | undefined): number {
  if (!value) {
    return 3001;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid port: ${value}`);
  }

  return parsed;
}

function parseReconnectGraceMs(value: string | undefined): number {
  if (!value) {
    return 30_000;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid RECONNECT_GRACE_MS: ${value}`);
  }

  return parsed;
}

async function main(): Promise<void> {
  const jwtSecret = requireEnv('JWT_SECRET');
  const port = parsePort(process.env['WS_PORT']);
  const reconnectGraceMs = parseReconnectGraceMs(process.env['RECONNECT_GRACE_MS']);
  const corsOrigin = process.env['CORS_ORIGIN'] ?? '*';

  const broadcaster = new StateBroadcaster();
  const host = new GameInstanceHost(broadcaster);
  const httpServer = createServer();
  const gateway = createWebsocketGateway({
    host,
    jwtSecret,
    reconnectGraceMs,
    httpServer,
    corsOrigin,
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    console.log(JSON.stringify({
      action: 'server.shutdown',
      message: 'Arena websocket gateway shutting down',
      signal,
    }));

    await gateway.shutdown();
    process.exit(0);
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(port, () => {
      resolve();
    });
  });

  console.log(JSON.stringify({
    action: 'server.start',
    message: 'Arena websocket gateway listening',
    port,
    reconnectGraceMs,
    corsOrigin,
    nodeEnv: process.env['NODE_ENV'] ?? 'development',
  }));
}

void main().catch((error: unknown) => {
  console.error(JSON.stringify({
    action: 'server.start',
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  }));
  process.exit(1);
});
