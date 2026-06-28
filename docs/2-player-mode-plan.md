# Plan: 2-Player Base Arcs Support

## Context

Our fork only supports 3-4 player Arcs (`minPlayers = 3`, 4 factions, no 2p path). The live hrf.im (0.8.153) has 2-player support we lack. Arcs has a fully-specified official 2-player variant in the base rulebook (pages 2, 4-5, 19) — this is implementing a known, documented ruleset, not designing one. We've messaged the operator on BGG; if he shares source this plan may become unnecessary, but given the July 31 shutdown deadline, building from the rulebook now is the safer bet.

Initial concern that the 4 dedicated 2-player board layouts would require heavy new board-modeling infrastructure was wrong — confirmed by reading `arcs/game-base.scala`: every `BaseBoard` (`Board3MixUp`, `Board4MixUp1`, etc.) is just a `clusters: $[Int]` list (which of the 6 physical map regions are active) plus a `starting: $[(System, System, $[System])]` list (one city/starport/gate-systems tuple per player). The per-system resource/slot mappings are global and shared by all boards already. A 2-player board is the same shape of data, just 2 starting tuples instead of 3-4, and fewer active clusters.

## Scope decision

Implement **one** 2-player board first ("Mix Up 1" — the other three, especially "Frontiers", are marked "for experienced players" in both the 2p and 3p versions, so Mix Up is the more standard starting layout) to get the full mechanic working end-to-end. The other three boards are pure data-entry repeats of the same pattern once this works, and can follow as a fast second pass.

## Rule deltas to implement (from rulebook pages 2, 4-5, 19)

| # | Rule | Source quote |
|---|---|---|
| 1 | Power-to-win is 33 (vs 30 for 3p, 27 for 4p) | "With 2 players, 33 Power." |
| 2 | The face-up Court row is 3 cards (vs 4 for 3-4p) — drawn directly at that size, no separate cull step | "Draw 3 cards (2 players) or 4 cards (3–4 players) from this deck to make a face-up Court row" |
| 3 | Starting placement at gate-system "1C": **2 ships into each of 2 systems** (4 total) instead of 2 ships into 1 system | "Place 2 ships in the system (3–4 players) or 2 systems (2 players) marked 1C" |
| 4 | 2 clusters (6 planets) get "out of play" markers, vs 1 cluster for 4p | rulebook step J |
| 5 | The 6 resources from those out-of-play planets get placed on ambition boxes: Material+Fuel→Tycoon, Weapons→Warlord, Relics→Keeper, Psionics→Empath | rulebook step K |
| 6 | At scoring, those 6 resources count as if a third (phantom) player had them; Weapons on Warlord count as Trophies specifically | rulebook p.19, "Two-Player Scoring" |
| 7 | After the initial 6-card hand draw, the player *without* initiative may discard and redraw their whole hand once (must keep the new hand) | rulebook p.19/p.5, "Two-Player Mulligans" |

Action-card exclusion of cards marked "1"/"7" is **already correct** for 2p — the existing code excludes them for anything other than `factions.num == 4`, so no change needed there.

## Implementation steps

1. **`arcs/meta.scala`**: `val minPlayers = 3` → `2`. `validateFactionCombination` already permits exactly 2 factions (only blocks below 2), so no change needed there. The lobby's player-count dropdown (built from `meta.minPlayers` in `hrf.scala:1072`) will automatically offer "2 players" once this changes.

2. **`arcs/meta.scala`**: add `case object Setup2PMixUp1 extends SetupCardOption { val count = $(2); ... }`, same pattern as the existing `Setup3PMixUp`/`Setup4PMixUp1` entries (lines ~57-80).

3. **`arcs/game-base.scala`**: add `case object Board2PMixUp1 extends BaseBoard { val name = "2 Players / Mix Up 1"; val clusters = $(...); val starting = $(...) }` — same shape as `Board3MixUp` (line 47), just 2 starting tuples and the cluster list read off the physical setup card. **Need to confirm exact cluster numbers/shapes against the physical card or a clearer scan** — my read of the card art (via cards.buriedgiant.com) was directionally right (6 wedges, 2 of them bare "out of play" zones, the rest labeled `1A/1B/1C/2A/2B/2C`) but I want this verified before committing exact numbers, since correctness here directly affects board legality.

4. **`arcs/game.scala`** (~line 1373-1380): add `case 2 if options.has(Setup2PMixUp1) => Board2PMixUp1` to the existing `factions.num @@ { ... }` board-selection match.

5. **Court deck cull count**: needs one more targeted look at the court-row setup step (around `game.scala:1337`, `ShuffleCourtDeckAction`/`ShuffledCourtDeckAction` in `game-common.scala:352-357`) to find exactly where "4" face-up cards get culled, and make it player-count-conditional.

6. **Starting placement "1C" variant — no new code needed.** `BaseFactionSetupAction` (`game-base.scala:184-188`) already does `fleets.foreach { fleet => place 2 ships in fleet }` — it places 2 ships into *every* system in the gate list, whatever its length. So a 2-player board just needs 2 entries in that tuple's third element (instead of 1), and the existing generic code automatically places 2 ships into each (4 total) with zero code changes — purely a board-data difference.

7. **Neutral resources on ambition boxes** (new, 2p-only setup step): after determining which 2 clusters are out-of-play for the active board, place 1 resource per excluded planet onto the corresponding ambition track, per the Material/Fuel→Tycoon, Weapons→Warlord, Relics→Keeper, Psionics→Empath mapping. Needs a small new state field to track these phantom resources per ambition.

8. **Ambition scoring adjustment**: wherever ambitions get scored at chapter-end (in `game-common.scala`, near the ambition-declaration logic), include the phantom resources as a third participant in the comparison, with Warlord's phantom Weapons counted as Trophies specifically (per the rulebook's special case).

9. **Mulligan mechanic** (new): after the initial 6-card hand draw in setup (near `BaseFactionSetupAction`/`ArcsStartAction` in `game-base.scala`/`game-common.scala`), add a one-time forced choice for the non-initiative player: keep hand, or discard all 6 and draw 6 new ones (no further mulligans, no rejecting the new hand).

10. **Power-to-win threshold**: confirm whether the existing victory check already derives the threshold from `factions.num` via a formula (pattern: `39 - 3*factions.num` gives 27/30/33 for 4/3/2 players) or is hardcoded per-count; add the 2p case if needed. Needs a follow-up grep for the actual `ArcsGameOverAction`/power-check trigger site.

11. **Bots**: no change needed — confirmed the existing pattern (bots/state only created for factions actually in `game.setup`) already generalizes correctly to any player count, including 2.

12. **Assets**: `setup-2p-01` through `setup-2p-04` already exist as placeholder names in the asset manifest (`arcs/meta.scala` ~line 818) but we don't have the actual card art files — same gap as everything else missing from this repo. Source from the operator if he responds, or mirror/extract similarly to how the rest of the Arcs asset set was recovered.

## Verification

- `sbt fastOptJS` compiles clean.
- Headless playthrough (reuse the Playwright scripts from this session, e.g. `debug-freeze.mjs`): start a 2-player Quick/Local game and confirm:
  - Lobby offers "2 players" as a selectable count
  - Setup completes without error; board renders with the correct 2 out-of-play clusters
  - Both factions get their starting pieces placed correctly (4 ships across the two 1C gate-systems)
  - Non-initiative player sees the mulligan prompt; accepting a new hand works
  - Phantom ambition resources appear on the correct tracks after setup
  - Game proceeds through at least one full turn with no console errors
  - Chapter-end ambition scoring correctly accounts for the phantom resources
- Manual rules cross-check against rulebook pages 4-5 (setup) and 19 (scoring/mulligan) for each mechanic as it's implemented.

## Open items to resolve during implementation (not blocking the plan)

- Exact `Board2PMixUp1` cluster/shape data — we now have a clear reference image of all 4 2p setup cards (Frontiers, Mix Up 1, Homelands, Mix Up 2) showing each cluster's player-position labels and which 2 clusters are marked "out of play". Use that (or the physical card, if available) to transcribe the final `clusters`/`starting` values precisely before committing — getting this wrong breaks board legality, so it's worth one careful pass rather than guessing from a description.
- Exact court-deck-cull and power-threshold code locations — one more grep pass each, not yet pinned down to a line.
