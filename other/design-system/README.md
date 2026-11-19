# Design system build

Builds the files of the Gift Pool Design System artifact
(https://claude.ai/artifact/KTeg7VDjdSYLGhRReQKsMd) from this codebase.

```bash
npm run design-system:build
```

The output lands in `build/design-system/project/`, laid out as the artifact
stores it. To publish, ask Claude Code to publish `build/design-system` to the
artifact. The artifact keeps its own index (`project/design-system.json`) and
its uploaded logo and icons, so the build writes neither.

## Where each part comes from

- Colour values: `app/styles/tailwind.css` (`:root` and `.dark`). Usage notes,
  the type scale, spacing, radii and shadows: `tokens.ts`. The build stops when
  a colour token has no note, or a note names a token that no longer exists.
- Fonts: the `@font-face` rules in `app/styles/fonts.css`.
- Components: the production files listed in `COMPONENTS` in `build.ts`,
  bundled as one script over the shims in `shims/`. `bundle.css` is the app's
  Tailwind config run over exactly the files that bundle pulled in.
- README, component guides, previews, the cover and the Logo page:
  `content/`. A component in `COMPONENTS` needs a folder there with a
  `preview.html` and a `README.md`.

To add a component, add it to `COMPONENTS`, then write its
`content/components/<Name>/preview.html` and `README.md`.
