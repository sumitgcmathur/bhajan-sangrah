Landing-page thumbnails (committed; not rebuilt on every site build).

Full banners: assets/icons/ (banner: in content/sections.yaml).
Section pages use icons/; the home grid uses these smaller JPEGs.

Regenerate only when a full banner changes:
  npm install
  npm run build:banners
  git add assets/banners/*.jpg
