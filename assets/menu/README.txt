Sidebar menu thumbnails (committed; not rebuilt on every site build).

Same source images as landing tiles (assets/icons/ via banner: in sections.yaml).
40×40 JPEG stretch (full banner squashed to square) — regenerate when a banner changes:

  npm run build:banners

Then commit assets/menu/*.jpg and npm run build.
