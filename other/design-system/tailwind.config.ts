import { type Config } from 'tailwindcss';
import base from '../../tailwind.config.ts';

// The app's config without its safelist; build.ts passes --content with the
// files esbuild actually bundled.
export default { ...base, safelist: [], content: [] } satisfies Config;
