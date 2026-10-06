# C4 — supplied engine sequence

Source: ezgif-5fb3d21ae16d4f41-jpg.zip (121 JPEGs, 868×484). Every frame was decoded and inspected on numbered contact sheets, followed by full-size/cropped inspection of movement boundaries. Numeric filename order 001→121 is preserved. No new engine, model, mechanical CSS shapes or screenshot texture is used.

## Visual mapping (inclusive source indices)

These are seven presentation phases selected from visible movement/contact landmarks, **not seven independently detachable CAD parts**. Motion in this flattened sequence is continuous; the frame boundaries are visual editorial cuts, not embedded source annotations. The supplied sequence cannot exactly depict arbitrary independently missing parts. C4 therefore displays only the consecutively completed prefix, never skipping an incomplete stage. A completed later checkbox remains recorded but cannot advance the assembly past an earlier gap.

| Stage | Business name | Weight | Frames | Visible event |
|---|---|---|---|---|
| 01 | ایجاد لید | 5% | 019–028 | Front fan advances toward the exposed disc stack; first gap narrows. |
| 02 | واجد شرایط و پیش‌فاکتور | 10% | 029–035 | Front stack draws together and settles; central disc remains exposed. |
| 03 | پیشبرد در قیف | 20% | 036–046 | Exposed central/front disc approaches the seated fan stack. |
| 04 | پیگیری | 15% | 047–053 | Central disc seats into the front body; exposed disc face disappears. |
| 05 | بستن قرارداد | 35% | 054–070 | Body/rear sleeve shifts; rear rotor remains visibly separated. |
| 06 | پیگیری پس از فروش | 10% | 071–076 | Rear rotor approaches; a gap is retained before the final join. |
| 07 | تأیید مالی و صحت داده | 5% | 077–121 | Rear join, stronger central glow, final bar illumination and settling. |

Intro/reset **001–018** is excluded from business-stage playback. Frame 018 alone is retained as the static zero-completion baseline. Business weight totals do not determine frame counts, play speed or attachment timing. Because source phases include approach and glow (not seven separate attachments), the strict “one separately missing section per stage” interpretation is not representable by this ZIP alone; no synthetic anatomy was fabricated to imply otherwise. All mechanically closed/finishing frames (077 onward) are gated behind all seven completed stages.

## Data and behavior

The local C4 invoice selector reads the existing LedgerPage `allRows` scope; completion comes from `stagesOf(deal)` in the commission engine — the same owner-adjusted stage source as the ledger checkboxes, including delegated-stage exclusions and legacy close-role fallback. No aggregate financial basis or funnel state is used as a completion proxy. Names and authoritative 5/10/20/15/35/10/5 weights reuse `STAGES` and `DEFAULT_WEIGHTS`; existing financial calculations and custom historical weights are not changed.

For each completed prefix stage: play forward → activate permanent number → fade Persian name in (300ms) → hold 2000ms → fade out (300ms) → next stage. Image loading gates advancement. Failure pauses with retry. Tab hiding pauses playback. A new invoice or changed stage signature resets the playback component immediately; a complete engine from an old record cannot leak into an incomplete one. Reduced motion displays the allowed final still without autoplay. Pause/replay never writes data. Numbers 01–07 remain present even when names fade. The existing C4 daily sales chart remains in a disclosure, with no changes to other tiles or page layout.

## Assets

Only 104 runtime WebPs (018–121) are in `public/assets/engine-assembly`. Each is resized to 720×401 and encoded at quality 65; total runtime size is 1,295,368 bytes (1.24 MiB). No source ZIP, original JPEGs, duplicate inspection frames or unused intro frames are committed. Playback uses 24 fps as a presentation setting because source JPEGs have no timing metadata.

## Verified states

| Completion | Prefix | Final still | Visual |
|---|---|---|---|
| 0% | none | 018 | Front discs separated, no active number. |
| 50% | 01–04 | 053 | Front stack seated; rear assembly still open. |
| 85% | 01–05 | 070 | Body compacted, rear rotor remains detached. |
| 100% | 01–07 | 121 | Complete compact engine and settled glow; seven active numbers. |

Validation: exhaustive unit coverage of all 128 checkbox combinations; browser checks for the four states, a nonconsecutive completion set, forward-only playback, 2-second holds/fades, no data writes, persistent numbers, reduced motion and mobile overflow. Screenshots generated in the review workspace, not copied into production assets.

Final checks: TypeScript and both Vite production builds passed; 76 unit tests passed (one optional private workbook test skipped); focused lint returned no warnings/errors; dedicated engine browser and existing ledger/approval/Google panel browser tests passed. No production deployment was performed.
