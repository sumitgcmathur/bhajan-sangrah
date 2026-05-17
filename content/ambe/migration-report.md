# Ambe section — migration report

Generated: 2026-05-17T18:39:39.102Z

Source: `C:/Sumit/coding/bhajan-sangrah/content-backup-20260517-123521/ambe` → `content/ambe/`

**Note:** Aarti was not modified. Ambe uses standard `sthayi` + `paragraphs` (not aarti couplet pairing).

| Metric | Count |
|--------|------:|
| Total | 20 |
| High confidence (≥80) | 17 |
| Medium (60–79) | 1 |
| Low (<60) | 2 |
| With तर्ज field | 11 |
| Stanza-block shape | 0 |
| One line per paragraph | 0 |
| Flagged for manual review | 2 |

## Per file

| File | Score | Tier | Shape | तर्ज | Paragraphs | Flags |
|------|------:|------|-------|-----|------------:|-------|
| `001-पूर-है-धीरियाणी-है.yaml` | 80 | high | single | बांगारी कोयल | 5 | — |
| `002-शिव-प्रिये-अम्बे-मात-मनाऊँ.yaml` | 80 | high | single | — | 7 | no-tarz-field |
| `003-मारी-सहाय-करे-जगदम्बा-सिंह-गाज-रयो.yaml` | 80 | high | ter-split | तीखे नैनों से नखवाली | 4 | multiline-paragraphs:4 |
| `004-जै-जै-जै-जै-सुराई.yaml` | 80 | high | pairs | बाबा सीता रे खोले में हनुमत डाली मूंडी | 5 | multiline-paragraphs:5 |
| `005-सहाय-जगदम्बे-कीजो-हमारी.yaml` | 94 | high | pairs | फूलन लो बहार | 3 | multiline-paragraphs:3 |
| `006-बरसे-श्री-जगदम्ब-मात-के.yaml` | 80 | high | ter-single | आजज रंग बरसे रे | 4 | multiline-paragraphs:4, verse-markers-in-text:1 |
| `007-रट-जगदम्बा-रो-नाम.yaml` | 80 | high | ter-split | खेलण दो गिणगोर भँवर म्हाने | 5 | multiline-paragraphs:5, verse-markers-in-text:2 |
| `008-आतोतो-आद-भवानी-ईश्वरी.yaml` | 80 | high | numbered-stanzas | आतोतो उत्तर दिशा री पीपली | 6 | — |
| `009-हद-नीको-रे-दरशन.yaml` | 80 | high | numbered-stanzas | रस लेवे रे रुख्याली, लेवे रे मिजाजजी हरम… | 5 | multiline-paragraphs:5 |
| `010-अम्बे-रानी-मैं-तो-राज-रा.yaml` | 80 | high | numbered-stanzas | — | 2 | no-tarz-field, multiline-paragraphs:2 |
| `011-नवदुर्गा-मात-भवानी-का.yaml` | 80 | high | numbered-stanzas | दिल लूटने वाले जादूगर (मदारी) | 3 | multiline-paragraphs:3 |
| `012-मैं-शरणे-आयो-है.yaml` | 80 | high | numbered-stanzas | बोलम रही है हे सालू वाली समदण नित नवी है | 5 | multiline-paragraphs:5 |
| `013-अम्बे-दर्श-तिहारो.yaml` | 80 | high | numbered-stanzas | जुलाबड़ारो | 3 | multiline-paragraphs:2 |
| `014-आयो-मैं-तो-अंबे-रानी.yaml` | 80 | high | ellipsis-stanzas | — | 4 | no-tarz-field, multiline-paragraphs:4 |
| `015-मोय-दीजे-वरदान-देवी.yaml` | 80 | high | pairs | — | 3 | no-tarz-field, multiline-paragraphs:2 |
| `016-अम्बे-चरण-कमल-है-तेरे.yaml` | 80 | high | refrain-blocks | — | 2 | no-tarz-field, multiline-paragraphs:1 |
| `017-ऐसा-प्यार-बहा-दे-मैया.yaml` | 68 | medium | refrain-blocks | — | 4 | long-song-many-verses, no-tarz-field, multiline-paragraphs:4 |
| `018-मेरा-जीवन-तेरी-शरण।.yaml` | 53 | low | refrain-stanza | — | 4 | long-song-many-verses, sthayi-equals-title, no-tarz-field, multiline-paragraphs:4 |
| `019-मेरे-मन-के-अंध-तमस-में.yaml` | 94 | high | refrain-blocks | — | 2 | no-tarz-field, multiline-paragraphs:2 |
| `020-हे-गिरि-नंदिनी,-विश्व-की-स्वामिनी.yaml` | 50 | low | chorus-quad | — | 12 | many-single-line-paragraphs, very-long-song, no-tarz-field, multiline-paragraphs:12, verse-markers-in-text:1 |

## Manual review suggested

- **53** `018-मेरा-जीवन-तेरी-शरण।.yaml` — मेरा जीवन तेरी शरण। _(long-song-many-verses, sthayi-equals-title, no-tarz-field, multiline-paragraphs:4)_
- **50** `020-हे-गिरि-नंदिनी,-विश्व-की-स्वामिनी.yaml` — हे गिरि नंदिनी, विश्व की स्वामिनी _(many-single-line-paragraphs, very-long-song, no-tarz-field, multiline-paragraphs:12, verse-markers-in-text:1)_