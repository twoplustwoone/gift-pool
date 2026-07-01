import {
  createContext,
  type RouterContext,
  type ServerBuild,
} from 'react-router';

type ServerBuildResult = Promise<{
  build: ServerBuild;
  error: unknown;
}>;

type GiftPoolRouterContexts = {
  cspNonceContext: RouterContext<string | undefined>;
  serverBuildContext: RouterContext<ServerBuildResult | undefined>;
};

const globalRouterContexts = globalThis as typeof globalThis & {
  __giftPoolRouterContexts?: GiftPoolRouterContexts;
};

globalRouterContexts.__giftPoolRouterContexts ??= {
  cspNonceContext: createContext<string | undefined>(undefined),
  serverBuildContext: createContext<ServerBuildResult | undefined>(undefined),
};

export const { cspNonceContext, serverBuildContext } =
  globalRouterContexts.__giftPoolRouterContexts;
