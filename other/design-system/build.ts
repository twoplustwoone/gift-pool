import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import * as esbuild from 'esbuild';
import {
  colorUsage,
  radiusNote,
  radiusTokens,
  shadowNote,
  shadowTokens,
  spacingNote,
  spacingTokens,
  typeGroups,
  type LengthToken,
} from './tokens.ts';

const TITLE = 'Gift Pool Design System';
const NAMESPACE = 'GiftPool';

type Component = { name: string; source: string; exports: string[] };

const COMPONENTS: Component[] = [
  {
    name: 'Button',
    source: 'app/components/ui/button.tsx',
    exports: ['Button'],
  },
  {
    name: 'StatusButton',
    source: 'app/components/ui/status-button.tsx',
    exports: ['StatusButton'],
  },
  {
    name: 'Card',
    source: 'app/components/ui/card.tsx',
    exports: ['Card', 'CardContent'],
  },
  {
    name: 'Section',
    source: 'app/components/ui/section.tsx',
    exports: ['Section'],
  },
  { name: 'Badge', source: 'app/components/ui/badge.tsx', exports: ['Badge'] },
  {
    name: 'PoolStatusBadge',
    source: 'app/components/pools/pool-status-badge.tsx',
    exports: ['PoolStatusBadge'],
  },
  {
    name: 'SystemLabel',
    source: 'app/components/ui/system-label.tsx',
    exports: ['SystemLabel'],
  },
  {
    name: 'SecrecyNote',
    source: 'app/components/ui/secrecy-note.tsx',
    exports: ['SecrecyNote'],
  },
  {
    name: 'EmptyState',
    source: 'app/components/ui/empty-state.tsx',
    exports: ['EmptyState'],
  },
  {
    name: 'Skeleton',
    source: 'app/components/ui/skeleton.tsx',
    exports: ['Skeleton'],
  },
  { name: 'Input', source: 'app/components/ui/input.tsx', exports: ['Input'] },
  {
    name: 'Textarea',
    source: 'app/components/ui/textarea.tsx',
    exports: ['Textarea'],
  },
  { name: 'Label', source: 'app/components/ui/label.tsx', exports: ['Label'] },
  {
    name: 'Checkbox',
    source: 'app/components/ui/checkbox.tsx',
    exports: ['Checkbox'],
  },
  {
    name: 'Switch',
    source: 'app/components/ui/switch.tsx',
    exports: ['Switch'],
  },
  {
    name: 'Select',
    source: 'app/components/ui/select.tsx',
    exports: [
      'Select',
      'SelectGroup',
      'SelectValue',
      'SelectTrigger',
      'SelectContent',
      'SelectLabel',
      'SelectItem',
      'SelectSeparator',
    ],
  },
  {
    name: 'Tooltip',
    source: 'app/components/ui/tooltip.tsx',
    exports: ['Tooltip', 'TooltipTrigger', 'TooltipContent', 'TooltipProvider'],
  },
  {
    name: 'DropdownMenu',
    source: 'app/components/ui/dropdown-menu.tsx',
    exports: [
      'DropdownMenu',
      'DropdownMenuTrigger',
      'DropdownMenuContent',
      'DropdownMenuItem',
      'DropdownMenuCheckboxItem',
      'DropdownMenuLabel',
      'DropdownMenuSeparator',
      'DropdownMenuGroup',
    ],
  },
  {
    name: 'ResponsiveDialog',
    source: 'app/components/ui/responsive-dialog.tsx',
    exports: [
      'ResponsiveDialog',
      'ResponsiveDialogTrigger',
      'ResponsiveDialogContent',
      'ResponsiveDialogHeader',
      'ResponsiveDialogFooter',
      'ResponsiveDialogTitle',
      'ResponsiveDialogDescription',
      'ResponsiveDialogClose',
    ],
  },
];

// Preview-only cards: showcase pages and the cover, not bundle exports.
const PAGES = new Set(['Cover', 'Logo']);

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const contentDir = path.join(here, 'content');
const outRoot = path.join(repo, 'build', 'design-system');
const out = path.join(outRoot, 'project');

const { ref } = parseArgs({
  options: { ref: { type: 'string', default: 'unknown' } },
}).values;

function cssBlock(css: string, selector: string) {
  const open = css.indexOf(`${selector} {`);
  if (open === -1) throw new Error(`No "${selector}" block in tailwind.css`);
  let depth = 0;
  for (let i = css.indexOf('{', open); i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(open, i);
  }
  throw new Error(`Unclosed "${selector}" block in tailwind.css`);
}

function cssVars(block: string) {
  const vars = new Map<string, string>();
  for (const declaration of block.split(';').slice(0, -1)) {
    const start = declaration.indexOf('--');
    const colon = declaration.indexOf(':', start);
    if (start !== -1 && colon > start + 2) {
      vars.set(
        declaration.slice(start + 2, colon),
        declaration.slice(colon + 1).trim(),
      );
    }
  }
  return vars;
}

const HSL_CHANNELS = /^[\d.]+ [\d.]+% [\d.]+%( \/ [\d.]+)?$/;
const VAR_REF = /^var\(--([a-z0-9-]+)\)$/;

function readColorThemes(css: string) {
  const light = cssVars(cssBlock(css, ':root'));
  const dark = cssVars(cssBlock(css, '.dark'));
  const isColor = (name: string): boolean => {
    const value = light.get(name) ?? '';
    const ref = VAR_REF.exec(value)?.[1];
    return HSL_CHANNELS.test(value) || (ref !== undefined && isColor(ref));
  };
  const toColor = (value: string) => {
    const ref = VAR_REF.exec(value)?.[1];
    return ref ? `{${ref}}` : `hsl(${value})`;
  };
  const tokens = [...light.keys()].filter(isColor).map((name) => {
    const darkValue = dark.get(name);
    return {
      name,
      value: {
        light: toColor(light.get(name)!),
        ...(darkValue ? { dark: toColor(darkValue) } : {}),
      },
      usage: colorUsage[name] ?? '',
    };
  });
  const names = new Set(tokens.map((t) => t.name));
  const undocumented = [...names].filter((n) => !colorUsage[n]);
  const stale = Object.keys(colorUsage).filter((n) => !names.has(n));
  if (undocumented.length || stale.length) {
    throw new Error(
      `Colour notes in tokens.ts are out of sync with tailwind.css.` +
        (undocumented.length ? `\n  No note: ${undocumented.join(', ')}` : '') +
        (stale.length ? `\n  No such token: ${stale.join(', ')}` : ''),
    );
  }
  const family = (name: string) => {
    const value = light.get(name);
    if (!value) throw new Error(`No --${name} in tailwind.css`);
    return value;
  };
  return {
    tokens,
    families: { sans: family('font-sans'), display: family('font-display') },
  };
}

async function readFonts() {
  const css = await fs.readFile(
    path.join(repo, 'app/styles/fonts.css'),
    'utf8',
  );
  return [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map(([, body]) => {
    const family = /font-family:\s*'([^']+)'/.exec(body!)?.[1];
    const url = /url\('([^']+)'\)/.exec(body!)?.[1];
    const weight = /font-weight:([^;]+);/.exec(body!)?.[1]?.trim();
    if (!family || !url || !weight)
      throw new Error(`Unreadable @font-face in fonts.css:${body}`);
    return {
      family,
      url,
      file: `fonts/${path.basename(url)}`,
      weight,
      style: 'normal',
    };
  });
}

function tokensCss(tokens: ReturnType<typeof buildTokens>) {
  const ref = (v: string) => v.replace(/^\{(.+)\}$/, 'var(--$1)');
  const lines = [`/* ${TITLE} — generated from tokens.json */`, ''];
  lines.push(':root, [data-theme="light"] {');
  for (const t of tokens.color.tokens)
    lines.push(`  --${t.name}: ${ref(t.value.light)};`);
  for (const t of tokens.shadow.tokens)
    lines.push(`  --${t.name}: ${t.value};`);
  lines.push('}', '[data-theme="dark"] {');
  for (const t of tokens.color.tokens) {
    const value =
      t.value.dark ??
      (t.value.light.startsWith('{') ? t.value.light : undefined);
    if (value) lines.push(`  --${t.name}: ${ref(value)};`);
  }
  lines.push('}', ':root {');
  for (const t of [...tokens.spacing.tokens, ...tokens.radius.tokens])
    lines.push(`  --${t.name}: ${t.value};`);
  for (const [key, stack] of Object.entries(tokens.type.families))
    lines.push(`  --font-${key}: ${stack};`);
  lines.push('}');
  for (const group of tokens.type.groups) {
    for (const s of group.styles) {
      lines.push(
        `.${s.name} { font-family: var(--font-${group.family}); font-size: ${s.fontSize}; line-height: ${s.lineHeight}; font-weight: ${s.fontWeight}; }`,
      );
    }
  }
  for (const f of tokens.type.fonts) {
    lines.push(
      `@font-face { font-family: '${f.family}'; src: url('${f.file}') format('woff2'); font-weight: ${f.weight}; font-style: ${f.style}; font-display: swap; }`,
    );
  }
  return lines.join('\n') + '\n';
}

function family(note: string | undefined, tokens: LengthToken[]) {
  return { ...(note ? { note } : {}), tokens };
}

function buildTokens(
  colors: ReturnType<typeof readColorThemes>,
  fonts: Awaited<ReturnType<typeof readFonts>>,
) {
  return {
    name: 'Gift Pool',
    version: 2,
    meta: {
      source: 'github',
      repo: 'twoplustwoone/gift-pool',
      ref,
      package: '.',
      paths: {
        tokens: ['app/styles/tailwind.css', 'other/design-system/tokens.ts'],
        fonts: ['app/styles/fonts.css', 'public/fonts'],
        assets: ['public/img/logo.svg', 'other/svg-icons'],
        docs: [
          'other/design-system/content',
          'docs/product/giftpool-ui-rework-handoff.md',
        ],
      },
      components: Object.fromEntries(COMPONENTS.map((c) => [c.name, c.source])),
      synced: new Date().toISOString().slice(0, 10),
    },
    color: {
      themes: [
        { id: 'light', name: 'Light' },
        { id: 'dark', name: 'Dark' },
      ],
      tokens: colors.tokens,
    },
    type: {
      fonts: fonts.map(({ family, file, weight, style }) => ({
        family,
        file,
        weight,
        style,
      })),
      families: colors.families,
      groups: typeGroups,
    },
    spacing: family(spacingNote, spacingTokens),
    radius: family(radiusNote, radiusTokens),
    shadow: family(shadowNote, shadowTokens),
  };
}

async function checkContent() {
  const dirs = await fs.readdir(path.join(contentDir, 'components'), {
    withFileTypes: true,
  });
  const folders = dirs.filter((d) => d.isDirectory()).map((d) => d.name);
  const registered = new Set(COMPONENTS.map((c) => c.name));
  const problems = [
    ...COMPONENTS.flatMap((c) =>
      ['preview.html', 'README.md']
        .filter(
          (f) => !existsSync(path.join(contentDir, 'components', c.name, f)),
        )
        .map((f) => `${c.name} has no content/components/${c.name}/${f}`),
    ),
    ...folders
      .filter((f) => !registered.has(f) && !PAGES.has(f))
      .map((f) => `content/components/${f} is not in COMPONENTS or PAGES`),
  ];
  if (problems.length) throw new Error(problems.join('\n'));
}

const shim = (file: string) => path.join(here, 'shims', file);

const resolveForArtifact: esbuild.Plugin = {
  name: 'gift-pool-artifact',
  setup(build) {
    build.onResolve({ filter: /^react$/ }, () => ({ path: shim('react.js') }));
    build.onResolve({ filter: /^react-dom$/ }, () => ({
      path: shim('react-dom.js'),
    }));
    build.onResolve({ filter: /^react\/jsx(-dev)?-runtime$/ }, () => ({
      path: shim('jsx-runtime.js'),
    }));
    // misc.tsx also pulls in react-router; the bundle only needs cn().
    build.onResolve({ filter: /^#app\/utils\/misc(\.tsx)?$/ }, () => ({
      path: path.join(repo, 'app/utils/cn.ts'),
    }));
    // Previews live at components/<Comp>/preview.html, next to the copied sprite.
    build.onResolve({ filter: /sprite\.svg$/ }, () => ({
      path: 'sprite',
      namespace: 'sprite',
    }));
    build.onLoad({ filter: /.*/, namespace: 'sprite' }, () => ({
      contents: 'export default "../sprite.svg";',
      loader: 'js',
    }));
  },
};

async function buildBundle() {
  const header = {
    format: 4,
    namespace: NAMESPACE,
    components: COMPONENTS.map(({ name }) => ({ name })),
  };
  const result = await esbuild.build({
    stdin: {
      contents: COMPONENTS.map(
        (c) => `export { ${c.exports.join(', ')} } from './${c.source}';`,
      ).join('\n'),
      resolveDir: repo,
      loader: 'tsx',
    },
    absWorkingDir: repo,
    bundle: true,
    format: 'iife',
    globalName: NAMESPACE,
    minify: true,
    jsx: 'automatic',
    target: 'es2020',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [resolveForArtifact],
    banner: { js: `/* @ds-bundle: ${JSON.stringify(header)} */` },
    outfile: path.join(out, 'components/bundle.js'),
    metafile: true,
    logLevel: 'warning',
  });
  const js = await fs.readFile(path.join(out, 'components/bundle.js'), 'utf8');
  if (/<\/script|<!--/i.test(js))
    throw new Error(
      'bundle.js contains </script or <!--, which breaks inlining',
    );
  return Object.keys(result.metafile.inputs).filter((input) =>
    input.startsWith('app/'),
  );
}

async function buildCss(appSources: string[]) {
  const raw = path.join(outRoot, 'tailwind.raw.css');
  execFileSync(
    path.join(repo, 'node_modules/.bin/tailwindcss'),
    [
      '-c',
      path.join(here, 'tailwind.config.ts'),
      '-i',
      path.join(here, 'tailwind.css'),
      '-o',
      raw,
      '--content',
      [
        ...appSources,
        'other/design-system/content/components/**/preview.html',
      ].join(','),
    ],
    { cwd: repo, stdio: ['ignore', 'ignore', 'inherit'] },
  );
  // The app stores colours as bare HSL channels; the artifact's tokens are whole colours.
  const css = (await fs.readFile(raw, 'utf8'))
    .replace(
      /hsl\(var\(--([\w-]+)\) \/ ([^()]*(?:\([^()]*\))?)\)/g,
      'hsl(from var(--$1) h s l / $2)',
    )
    .replace(/hsl\(var\(--([\w-]+)\)\)/g, 'var(--$1)');
  await fs.rm(raw);
  if (/hsl\(var\(/.test(css))
    throw new Error(
      'bundle.css still has an hsl(var(--x)) colour the rewrite missed',
    );
  await fs.writeFile(
    path.join(out, 'components/bundle.css'),
    `/* ${TITLE} components — Tailwind build over tokens.css. Alpha uses hsl(from var(--x) h s l / a). */\n${css}`,
  );
}

async function main() {
  const sprite = path.join(repo, 'app/components/ui/icons/sprite.svg');
  if (!existsSync(sprite))
    throw new Error('No icon sprite. Run `npm run build:icons` first.');
  await checkContent();
  await fs.rm(outRoot, { recursive: true, force: true });
  await fs.cp(contentDir, out, { recursive: true });

  const css = (
    await fs.readFile(path.join(repo, 'app/styles/tailwind.css'), 'utf8')
  ).replace(/\/\*[\s\S]*?\*\//g, '');
  const fonts = await readFonts();
  const tokens = buildTokens(readColorThemes(css), fonts);
  await fs.writeFile(
    path.join(out, 'tokens.json'),
    JSON.stringify(tokens, null, 1) + '\n',
  );
  await fs.writeFile(path.join(out, 'tokens.css'), tokensCss(tokens));
  await fs.mkdir(path.join(out, 'fonts'), { recursive: true });
  await Promise.all([
    ...fonts.map((f) =>
      fs.copyFile(path.join(repo, 'public', f.url), path.join(out, f.file)),
    ),
    fs.copyFile(sprite, path.join(out, 'components/sprite.svg')),
  ]);

  await buildCss(await buildBundle());

  console.log(
    `Built ${path.relative(repo, out)}: ${tokens.color.tokens.length} colours, ${COMPONENTS.length} components, ref ${tokens.meta.ref}.`,
  );
}

await main();
