# Canvas Sync Check

Changed files checked: 2
Missing from Governs: 2
- .claude/state/phase-cost-cursor.json
- .claude/state/phase-cost.json

Missing from Operations: 2
- .claude/state/phase-cost-cursor.json
- .claude/state/phase-cost.json

## Proposed Canvas patch (deterministic)

Add to `## Governs`:

- `.claude/state/phase-cost-cursor.json`
- `.claude/state/phase-cost.json`

Add to `## Operations`:

- TODO(canvas-sync): document the operation that lands in `.claude/state/phase-cost-cursor.json`
- TODO(canvas-sync): document the operation that lands in `.claude/state/phase-cost.json`

Run `npm run canvas-sync -- --write` to apply this patch, then review. Or edit the Canvas by hand.

Update `specs\design\reasons-canvas.md` before treating the design as synchronized.
