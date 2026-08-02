# Not yet ported

These are v1 files carried over verbatim by the rsync copy. They still import
the v1 block model (`blocks/model.ts`, `blocks/defs.ts`, `blocks/render.ts`),
which no longer exists, so they are parked here and excluded from `tsconfig.json`
until their phase lands. **Nothing here is on the build path.**

| File | Ported in | What changes |
|---|---|---|
| `export.ts` | Phase 4, step 16 | `yamlValue`, `frontmatterYaml`, `resolveSchemaType`, `jsonld`, `assembleDocument` port near-verbatim; only the `collectStats` / `renderHero` / `renderContent` callsites change to Puck `Data` + `walkTree`. |
| `lint.ts` | Phase 4, step 18 | `headingIssues` and the meta checks port verbatim (one regex tweak: `/<label[^>]*class="[^"]*faq-question/`, because React reorders attributes). `altIssues` and the icons/downloads walk get rewritten onto `walkTree`. The hero-count check is deleted — the hero is a root field now, so there is exactly one by construction. |
| `word-faq.test.ts` | Phase 3 / 6 | The `wordAnimate` half ports as-is (that module is unchanged); the FAQ half waits for the FAQ component in Phase 6. |
| `svg-modal.test.ts` | Phase 3, step 13 | The `themeSvgText` / `prepareSvgForInline` half survives untouched; the modal half is deleted with `ui/dom.ts`. |

Delete this folder once it is empty.
