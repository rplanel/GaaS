# Recorded Galaxy workflow payloads

Real payloads from real Galaxy instances, recorded once and committed, so the
characterisation suite in `../../characterisation/` runs without a live
Galaxy (#86).

Nothing here is hand-written, and nothing here should be hand-edited. The
point of recording was to capture the shapes Galaxy really emits — including
the ones nobody thought to model. A hand-edited fixture can only contain
shapes somebody thought of, which is the one thing that would make this suite
useless. If a payload needs to change, re-record it.

## What each directory holds

| File | Galaxy call |
|---|---|
| `workflow.live.json` | `GET /api/workflows/{id}` — what the description endpoint read and served verbatim until #88 |
| `workflow.export.json` | `GET /api/workflows/{id}/download?style=export` — what publishing stores in `galaxy.workflows.definition`, and what the description endpoint describes a revision from since #88 |
| `revisions.json` | `GET /api/workflows/{id}/versions` |
| `tools/*.json` | `GET /api/tools/{id}?io_details=true&tool_version=…`, one per distinct `toolId@version` |
| `manifest.json` | Which instance, which Galaxy version, which revision, which command, and the shape census |

The calls are spelled exactly as `blendtype` spells them (`getWorkflowEffect`,
`exportWorkflowEffect`, `getWorkflowRevisionsEffect`, `getToolEffect`), so what
is on disk is what the application sees.

**There is no recording of what the endpoint answers with, on purpose.** Since
#88 that answer is the export normalised by `describedStepsOf` and
`describedInputsOf`, and the suites build it at test time by calling those —
`../../describedSteps.ts` is the way in. A recorded `description.json` would
freeze the normaliser's behaviour as it was on the day it was recorded, so
changing the normaliser would leave every suite green; calling it means the
change is a failing assertion (#103). Nothing here has to be re-recorded when
the normaliser changes.

## The recordings

| Directory | Instance | Galaxy | Steps | Why it is here |
|---|---|---|---|---|
| `ccqtl-today` | galaxy.pasteur.fr | 22.05.1 | 7 | The baseline: what production reads today. A data input and a `RuntimeValue`. |
| `conditional-repeat-runtime` | usegalaxy.eu | 26.1 | 5 | A conditional inside a repeat, a conditional inside a section, a repeat, a `RuntimeValue`. |
| `fan-in` | usegalaxy.eu | 26.1 | 23 | An input fed by two upstream outputs, keyed `batchmode\|input_fastas`. Export only — a fan-in lives in the connections and never reaches a tool definition. |
| `subworkflow-nested` | usegalaxy.eu | 26.1 | 14 | A subworkflow step, and a subworkflow inside that subworkflow (#89). Export only, as `fan-in` is. |

**What `subworkflow-nested` was recorded for.** The export schema *refused* a
subworkflow step outright: Galaxy omits `content_id`, `tool_state`,
`tool_version` and `errors` on one and writes `tool_id` as `null`, and
`subworkflow` was not in the step-type enum at all — so a workflow holding one
could not be published. Two levels deep on purpose: the graph draws a
subworkflow as one step that opens onto its own graph, and a recording only one
level deep would let a normaliser that fails to recurse pass.

It turned out to pin one more thing, found in #102 rather than aimed at: on a
subworkflow step the live payload writes `tool_inputs: null`, and the saved
state of the two `__APPLY_RULES__` steps *inside* its subworkflows holds lists
of plain objects carrying no `__index__` — so only the export shows them, the
live payload having nothing to say about a subworkflow's own steps at all.

**Why two instances.** No workflow in Pasteur's account carries a conditional,
a repeat or a fan-in; a survey of 160 published workflows on usegalaxy.eu found
only four carrying all five shapes at once, the smallest of them 57 steps. The
ticket allows "one workflow or a small set", so the set is three small ones.
Keeping `ccqtl-today` at 22.05 alongside two at 26.1 means the suite pins both
the version production runs and the version the refactor targets, so the
upgrade itself is covered rather than assumed.

## Re-recording

From the repository root, with the Galaxy credentials in the environment:

```bash
set -a && . ./playground/.env && set +a

# the Pasteur baseline
node scripts/record-workflow-fixtures.mts 0bd41bf44b0f6f7d --name ccqtl-today

# the two public ones — no key needed, published workflows are public
node scripts/record-workflow-fixtures.mts 95dfc6403c0edd08 \
  --instance https://usegalaxy.eu --name conditional-repeat-runtime
node scripts/record-workflow-fixtures.mts 5a30e01ff719f396 \
  --instance https://usegalaxy.eu --name fan-in --no-tools
node scripts/record-workflow-fixtures.mts 3975af16fc2a407e \
  --instance https://usegalaxy.eu --name subworkflow-nested --no-tools
```

Each directory's `manifest.json` carries the command that reproduces it,
`--instance` and `--no-tools` included.

Each command replaces its directory wholesale. Read the diff before committing
it: a re-recording that changes the derived model is the suite telling you
something, not noise to be waved through.

## Finding another candidate

`--census-only` reports what one workflow contains and writes nothing;
`--survey` reports it for every workflow an account holds, or with
`--published` for a public instance's published ones:

```bash
node scripts/record-workflow-fixtures.mts <workflowId> --census-only
node scripts/record-workflow-fixtures.mts --survey
node scripts/record-workflow-fixtures.mts --survey \
  --instance https://usegalaxy.eu --published --limit 160
```

Both print a yes/no verdict per workflow against the five shapes #86 names.
The survey's columns carry a sixth, `subworkflow`, which the verdict does not:
the verdict answers "does this exercise what #86 asked for", and a sixth shape
there would report every fixture already committed as incomplete.

## Two things the recorder does on purpose

**It blanks a data parameter's `options`.** `io_details=true` makes Galaxy fill
a `DataToolParameter`'s `hda` / `hdca` lists from whichever history the
recording account touched last. Those are real dataset names belonging to a
real person, and they differ between two runs an hour apart. The derived
parameter model never reads them, so blanking costs the suite nothing and
removes both the leak and the only source of churn that would make a
re-recording look like a behaviour change. `--keep-dataset-options` turns it
off; read what it writes before committing it.

**It records the served tool version beside the asked-for one.** Galaxy's
`get_tool` runs without `exact`, so it answers `200` with another installed
version when it lacks the one requested (#75). A fixture recorded from the
wrong version would pin the wrong parameter list while looking perfectly
healthy, so `manifest.json` carries both and the suite asserts they match.
