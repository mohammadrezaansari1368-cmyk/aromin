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

For each completed prefix stage: advance only through that stage's supplied frames → subtle anchor glow (150ms) → activate its English number → fade the Persian overlay name in (300ms) → hold 2000ms → fade out (300ms). Once the real completed prefix ends, hold the final valid image for a further 2000ms, fade out for 300ms, reset to frame 018 while invisible, wait for image load, fade in for 300ms and repeat. There is no reverse frame playback. At zero completion the image remains 018 without a loop. Reduced motion renders the valid final still, with no animated label, autoplay or loop.

`ENGINE_STAGES` is the single resolved configuration for number, key, label, business weight, source frame start/end and percentage x/y anchor. Keys/names/weights reuse existing commission constants. Numbers are responsive HTML overlays over the engine, not a separate grid/progress bar. Each transient Persian name shares its number's anchor, uses an edge-aware alignment and wraps inside the scene. WebPs are unmodified. Overlay decoration is aria-hidden; the stable image alt and semantic completion status expose the real prefix/weight without announcing animation frames repeatedly.

Image loading gates advancement. Failure pauses with retry. Tab hiding and the local pause control suspend the timer; resumption cannot advance past the valid prefix. A new invoice or changed stage signature remounts playback immediately. Controls never write business data or intercept scrolling/global input. The existing daily chart disclosure and every other tile remain untouched.

## Assets

Only 104 runtime WebPs (018–121) are in `public/assets/engine-assembly`. Each is resized to 720×401 and encoded at quality 65; total runtime size is 1,295,368 bytes (1.24 MiB). No source ZIP, original JPEGs, duplicate inspection frames or unused intro frames are committed. Playback uses 24 fps as a presentation setting because source JPEGs have no timing metadata.

## Verified states

| Completion | Prefix | Final still | Visual |
|---|---|---|---|
| 0% | none | 018 | Front discs separated, no active number. |
| 50% | 01–04 | 053 | Front stack seated; rear assembly still open. |
| 85% | 01–05 | 070 | Body compacted, rear rotor remains detached. |
| 100% | 01–07 | 121 | Complete compact engine and settled glow; seven active numbers. |

Validation: exhaustive unit coverage of all 128 checkbox combinations across repeated loops; independent weight/range assertions; static reduced-motion endpoints; glow/activation/label/final-hold ordering. Browser checks cover two cycles each at 50%, 85%, 100% and a gapped completion set, zero completion, pause and tab visibility, reduced motion, zero API writes, and responsive overlay/label containment at desktop/tablet/mobile widths. Screenshots are review artifacts only, not production assets.

PR #4 remains on `feature/c4-engine-assembly`. Repository baseline/history cleanup is outside this C4 change. No merge or deployment.

Finalization checks: TypeScript and both production builds passed; six focused tests passed (including all 128 stage combinations across repeated loops); dedicated C4 browser test and existing feature browser check passed; focused lint passed. SHA-256 verification confirmed all 104 production WebPs are byte-for-byte unchanged.
