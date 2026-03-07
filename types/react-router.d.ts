import 'react-router';

declare module 'react-router' {
  interface AppLoadContext {
    cspNonce?: string;
    serverBuild?: Promise<{
      build: import('react-router').ServerBuild;
      error: unknown;
    }>;
  }
}
