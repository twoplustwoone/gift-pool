import { type ServerBuild as ReactRouterServerBuild } from 'react-router';

declare module '@remix-run/server-runtime' {
  export type ServerBuild = ReactRouterServerBuild;
}
