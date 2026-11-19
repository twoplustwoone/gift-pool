# Skeleton

A pulsing `muted` placeholder for a region whose layout is already known.

**Props:** `className` sets the size and shape (`h-4 w-1/3`, `h-10 w-10 rounded-full`).

- Mirror the real layout so nothing jumps when content arrives.
- Use local skeletons for images and content regions. Full-route skeletons only where the destination is known.

Source: `app/components/ui/skeleton.tsx` in twoplustwoone/gift-pool, bundled as is.
