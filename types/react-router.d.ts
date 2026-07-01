import { type ServerBuild } from 'react-router';

declare module 'react-router' {
  interface Future {
    v8_middleware: true;
  }

  interface AppLoadContext {
    cspNonce?: string;
    serverBuild?: Promise<{
      build: ServerBuild;
      error: unknown;
    }>;
  }
}
