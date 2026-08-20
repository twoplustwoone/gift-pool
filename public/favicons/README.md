# Favicon

Icons here account for different devices. In some cases we cannot reliably
detect a light/dark mode preference, so some of these icons deliberately do not
have a transparent background.

| File                        | Referenced by                                |
| --------------------------- | -------------------------------------------- |
| `android-chrome-192x192.png` | `site.webmanifest`, push notifications in `sw.js` |
| `android-chrome-512x512.png` | `site.webmanifest`                           |
| `favicon.svg`               | — see note below                              |
| `apple-touch-icon.png`      | — see note below                              |

Note: `app/root.tsx` links the SVG icon and the apple-touch icon from
`app/assets/favicons/`, not from this directory, so those two files are built
as content-hashed assets. The copies here are byte-identical duplicates kept at
stable paths. Update both locations together or they will drift.

There is also a `favicon.ico` in the root of `/public`, which older browsers
request automatically. That one is a fallback for those browsers.
