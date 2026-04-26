# Scoring Parser Exploration

This note explores how GameStreamer should parse natural-language scoring input into deterministic baseball scoring events.

## Recommendation

GameStreamer should not ask an LLM to own baseball state transitions. The system should use deterministic game rules for scoring outcomes, runner movement, count changes, inning transitions, and validation.

Claude can still be useful, but only as a fallback translator from messy scorer language into a known command schema. The rule engine should decide whether that command is legal and how it changes the game.

Recommended pipeline:

```text
raw scorer input
  -> normalize text
  -> deterministic parser
  -> confidence score
  -> scoring command
  -> deterministic rule engine
  -> validation
  -> apply game state

if parser confidence is low:
  -> Claude fallback returns only a scoring command
  -> deterministic rule engine still validates and applies
```

## Sources Researched

- MLB Official Scoring rules, especially Rule 9, via Baseball Rules Academy:
  - [Rule 9 scoring index](https://baseballrulesacademy.com/official-rule/mlb/the-rules-of-scoring/)
  - [Rule 9.04 Runs Batted In](https://baseballrulesacademy.com/official-rule/mlb/9-04-runs-batted/)
  - [Rule 9.05 Base Hits](https://baseballrulesacademy.com/official-rule/mlb/9-05-base-hits/)
  - [Rule 9.06 Determining Value of Base Hits](https://baseballrulesacademy.com/official-rule/mlb/9-06-determining-value-of-base-hits/)
  - [Rule 9.07 Stolen Bases and Caught Stealing](https://baseballrulesacademy.com/official-rule/mlb/9-07-stolen-bases-caught-stealing/)
  - [Rule 9.08 Sacrifices](https://baseballrulesacademy.com/official-rule/mlb/9-08-sacrifices/)
  - [Rule 9.12 Errors](https://baseballrulesacademy.com/official-rule/mlb/9-12-errors/)
  - [Rule 9.13 Wild Pitches and Passed Balls](https://baseballrulesacademy.com/official-rule/mlb/9-13-wild-pitches-passed-balls/)
  - [Rule 9.14 Base on Balls](https://baseballrulesacademy.com/official-rule/mlb/9-14-base-balls/)
  - [Rule 9.15 Strikeouts](https://baseballrulesacademy.com/official-rule/mlb/9-15-strikeouts/)
- [Little League Scorekeeping 101](https://www.littleleague.org/university/articles/scorekeeping-101/)
- [GoRout baseball scorekeeping guide](https://gorout.com/baseball-scorekeeping/)

## Current App Shape

Today, `lib/claude.js` asks Claude to return a nearly final `structured_play`. Then `lib/game-logic.js` validates a few invariants and applies the runner, score, out, count, and inning transitions.

That means Claude currently does too much:

- It decides the play type.
- It decides runner movement.
- It decides runs and RBI.
- It decides hits/errors.
- It may decide force movement implicitly.

The safer split is:

- Parser decides intent.
- Rule engine decides consequences.
- Validator rejects impossible states.

## Canonical Command Schema

Use a command schema that describes what the scorer claims happened, not the final mutated game state.

```json
{
  "type": "at_bat_result",
  "event": "single|double|triple|home_run|walk|intentional_walk|hit_by_pitch|strikeout|groundout|flyout|lineout|popup|fielders_choice|error|sacrifice_bunt|sacrifice_fly|interference|obstruction|other",
  "batter": "name or null",
  "fielding_sequence": [6, 4, 3],
  "modifiers": ["looking", "swinging", "dropped_third_strike", "bunt", "force", "tag", "appeal"],
  "advances": [
    { "runner": "batter", "from": "home", "to": "1", "reason": "hit" },
    { "runner": null, "from": "1", "to": "3", "reason": "on_hit" }
  ],
  "outs": [
    { "runner": "batter", "base": "1", "reason": "putout" }
  ],
  "runs": [
    { "runner": null, "from": "3", "rbi": true }
  ],
  "errors": [
    { "fielder": 6, "kind": "fielding|throwing|catching" }
  ],
  "confidence": 0.98,
  "needs_clarification": false
}
```

For pitch-only input:

```json
{
  "type": "pitch",
  "call": "ball|called_strike|swinging_strike|foul|foul_tip|in_play",
  "result": "live|dead",
  "confidence": 1
}
```

For runner-only events:

```json
{
  "type": "base_running",
  "event": "stolen_base|caught_stealing|pickoff|wild_pitch|passed_ball|balk|defensive_indifference",
  "advances": [
    { "runner": null, "from": "1", "to": "2", "reason": "stolen_base" }
  ],
  "outs": []
}
```

## Deterministic Coverage Map

### Pitch and Count

High-confidence deterministic inputs:

- `ball`, `ball one`, `outside`, `low`, `ball 4`
- `strike`, `called strike`, `strike looking`, `swinging strike`, `whiff`
- `foul`, `foul ball`
- `foul tip`

Rule engine details:

- Ball increments balls until four.
- Strike increments strikes until three.
- Foul with fewer than two strikes increments strikes.
- Foul with two strikes usually leaves count unchanged.
- Foul bunt with two strikes is a strikeout.
- Ball four creates a walk and forces runners only as needed.
- Hit by pitch awards first and forces runners only as needed.

### Safe Hits

Events:

- Single, double, triple, home run
- Ground-rule double
- Inside-the-park home run
- Grand slam
- Walk-off hit rules can be deferred unless full official stats matter.

Rule engine details:

- Batter destination is determined by event.
- Forced runners advance when required.
- Optional explicit runner advances override defaults.
- Home run scores batter and all runners.
- Runs from hits usually credit RBI unless an error/no-RBI exception applies.

Important nuance from Rule 9.06:

- Hit value is the batter's earned base value, not simply how far other runners advanced.
- If defense throws behind a lead runner and batter takes an extra base, that may be a single plus advance on throw, not a double.

### Outs

Events:

- Strikeout looking/swinging
- Groundout, flyout, lineout, popup
- Force out
- Tag out
- Double play, triple play
- Infield fly
- Appeal out
- Batter interference / runner interference

Notation to parse:

- `6-3`, `4-3`, `5-3`
- `F8`, `L6`, `P4`
- `K`, `ꓘ` or `K looking`, `K swinging`
- `6-4-3 DP`, `4-6-3`, `5-4-3`, `3-6-1`

Rule engine details:

- Outs cannot exceed the remaining outs in the half-inning.
- Third out ends the half-inning and clears bases.
- On a third out force play, runs that crossed before the out may not count. This needs explicit support.
- Double play and triple play are summaries; the engine still needs affected runners.

### Walks and Awards

Events:

- Walk/base on balls
- Intentional walk
- Hit by pitch
- Catcher interference
- Obstruction
- Balk

Rule engine details:

- Walk/HBP/interference awards batter first.
- Forced runners advance one base; unforced runners stay unless explicitly advanced.
- Bases loaded walk/HBP/interference scores runner from third and credits RBI for BB/HBP/interference cases under Rule 9.04.
- Balk advances each runner one base; batter does not advance unless the pitch also creates an award.

### Steals and Runner Movement

Events:

- Stolen base
- Double steal, triple steal
- Caught stealing
- Pickoff
- Pickoff plus advance
- Defensive indifference

Important nuance from Rule 9.07:

- A steal is not credited when the runner advances because of hit, putout, error, force, fielder's choice, passed ball, wild pitch, or balk.
- Defensive indifference is scored as fielder's choice, not stolen base.
- If a double/triple steal has a runner thrown out before reaching the target base, other runners are generally not credited with stolen bases.

### Errors and Fielder's Choice

Events:

- Reached on error
- Throwing error
- Fielding error
- Dropped fly
- Fielder's choice
- Safe on attempt at another runner

Rule engine details:

- Errors can allow batter safe, prolong at-bat, prolong runner presence, or allow extra base advancement.
- Slow handling alone is not necessarily an error.
- Fielder's choice often needs explicit runner-out or attempted-runner context.
- Parser should avoid guessing hit vs error when user says only `safe at first`; ask for clarification or default to `other`.

### Wild Pitch and Passed Ball

Events:

- Wild pitch
- Passed ball
- Strikeout plus wild pitch/passed ball on dropped third strike

Important nuance from Rule 9.13:

- WP is charged to pitcher when the pitch could not be stopped with ordinary effort and runners advance.
- PB is charged to catcher when ordinary effort should have controlled it and runners advance.
- If the defense records an out before any runner advances, do not charge WP/PB; other advances may become fielder's choice.
- Dropped third strike can be both strikeout and WP/PB if batter reaches first.

### Sacrifices and RBI

Events:

- Sacrifice bunt
- Sacrifice fly
- Productive out with RBI

Important nuance from Rules 9.04 and 9.08:

- Sac bunt/fly generally requires fewer than two outs.
- Sac fly requires a caught fly/line drive, or a dropped ball where runner from third would have scored after the catch.
- RBI is credited when batter action causes the run, with exceptions for force double plays and certain errors.
- Runs on errors can still get RBI when, before two outs, runner from third would ordinarily score.

## Parser Strategy

### Phase 1: Deterministic Fast Path

Start with high-confidence command families:

- Pitch calls.
- Common hits.
- Walk/HBP.
- Strikeouts.
- Common outs by notation.
- Common steals/caught stealing.
- Common runner advancement phrases.
- Common scorekeeper abbreviations.

Each parser should return:

```json
{
  "command": {},
  "confidence": 0.0,
  "unparsed_tokens": [],
  "warnings": []
}
```

### Phase 2: Clarification Before Guessing

Ask for clarification when:

- A runner scores but source base is unclear and multiple runners exist.
- `safe` appears without hit/error/FC context.
- `out at second` appears without identifying runner when multiple candidates exist.
- Hit vs error is ambiguous.
- WP vs PB is ambiguous.
- A run may be affected by third-out force/timing.

### Phase 3: LLM Fallback

Claude should return the same canonical command schema, not final `runs_scored`, not final base occupancy, and not direct score mutations.

The fallback prompt should say:

- Use only allowed enum values.
- Do not invent final game state.
- Preserve uncertainty in `needs_clarification`.
- Prefer `other` or clarification over unsupported scoring decisions.

## Implementation Backlog

1. Add `lib/scoring-schema.js` with event enums and validation helpers.
2. Add `lib/scoring-parser.js` with deterministic parsers for high-confidence phrases.
3. Expand `lib/game-logic.js` from `applyPlay` to `applyCommand`.
4. Keep the existing `parsePlay` Claude path behind fallback only.
5. Add golden tests from scorekeeping notation:
   - `ball`, `foul with two strikes`, `ball four`
   - `6-3`, `F8`, `K looking`, `6-4-3 DP`
   - `single`, `double runner scores`, `grand slam`
   - `walk bases loaded`, `HBP bases loaded`
   - `SB 2`, `CS 2-6`, `WP runner to third`, `PB runner scores`
   - `E6 batter safe`, `FC runner out at second`
6. Log parser confidence and user corrections to build an evaluation dataset.

## Open Product Decisions

- Should youth rules differ by league? Examples: dropped third strike, balks, run limits, mercy rules, continuous batting order.
- Should GameStreamer track official stats like AB, RBI, errors, WP/PB, SB/CS from day one, or only scoreboard state first?
- Should ambiguous scoring judgments be explicit buttons in the UI rather than inferred from speech?
- Should the scorer be able to set a rule profile per game?

## Near-Term Scope

For the next implementation pass, focus on scoreboard-correct outcomes before full official-stat correctness:

- Count.
- Outs.
- Runs.
- Runner occupancy.
- Inning transitions.
- Basic event type.
- Enough metadata to improve later official scoring.

This gives scorekeepers a more reliable live game experience while leaving room to refine official stat attribution over time.
