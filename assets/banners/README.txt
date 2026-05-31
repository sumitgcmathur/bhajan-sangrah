Landing-page thumbnails (committed; not rebuilt on every site build).

Full banners: assets/icons/ (banner: in content/sections.yaml).
Section pages use icons/; the home grid uses these smaller JPEGs.

Regenerate only when a full banner changes (outputs fixed 352×761 cover crops):
  npm install
  npm run build:banners

After updating icons/, run once to recompress icons and refresh banners:
  npm run optimize:icons
  git add assets/banners/*.jpg
