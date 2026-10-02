---
status: accepted
date: 2026-10-02
---

# Ranks are ordered by anchor, and a connection spanning several ranks is drawn through dagre's route

The workflow graph read only each step's position from dagre and threw away the route dagre computes for every connection. The canvas drew a bezier straight between the two anchors, so a connection spanning more than one rank crossed whatever stood in between: 13 connections over the recorded levels ran through a step that was neither of their ends. Drawing dagre's routes as they come does not mend it on its own. Dagre orders each rank by where the steps stand, as if every connection left and arrived at a step's middle, while a step's anchors are spread down its side, so the legs next to the steps fan across each other (#123).

We decided to **order every rank by anchor, through dagre's own `customOrder`, and to draw a connection spanning more than one rank through its route, while every other connection keeps the bezier between its anchors**. The order runs dagre's own `order` first, numbers each rank 0 to n − 1 in that order, and then sweeps the ranks down and up in turn, eight times, placing each step and each dummy at the mean of where the connections meeting it come from, each counted at its anchor rather than at its step's middle. Whichever ordering crosses fewest connections counted that way is kept, dagre's own included. A routed connection is a chain of Vue Flow's beziers, from its source anchor through each point of dagre's route to its target anchor, each piece leaving and arriving along the way the ranks run. One pure function, `connectionPath`, draws both kinds, and the canvas's own edge and the crossing count of #134 both call it.

#123's design spike measured each configuration on the computed geometry of every line. The table gives totals over the seven recorded levels in both directions, as crossings / connections run through a step.

| Configuration | Crossings | Through a step |
|---|---|---|
| The canvas before this decision | 154 | 13 |
| That order, with dagre's routes drawn | 245 | 0 |
| Ordered by anchor, with every route drawn | 66 | 0 |
| **Ordered by anchor, routes only past adjacent ranks (what ships)** | **62** | **0** |

The hybrid is what ships because between two adjacent ranks nothing can stand, so dagre's route there is a single point halfway that only adds a bend. 93 of the 109 connections on the recorded levels are between adjacent ranks, in either direction. Drawing them through that point, as the spike's every-route run did, crossed four more times, all on ccqtl-today. It also made 109 of that run's 133 route pieces that climb more than twice their run.

The spike anchored each line on the step's side. Vue Flow anchors it 3 px further out, at the outer edge of a 6 px handle, and #134 measures there: 156 / 13 before this decision and 62 / 0 after it, the same 62 level by level. Those are the ceilings `workflowGraph.test.ts` pins.

**Numbering each rank afresh is also what stops dagre 3.1.1 throwing.** Dagre 3.1 loses one of three parallel connections out of its ordering, and on a level where it does, #121 lays the level out from one edge per pair of steps instead (`conditional-repeat-runtime` was one). The spike laid out 20 000 seeded random multigraphs of 4 to 15 steps in both directions. Dagre's own order threw on 71% of those 40 000 layouts, and with the ranks renumbered it threw on none. Wherever dagre's own order succeeded cleanly, the renumbered layout was identical. Every recorded level is now laid out per connection.

## Considered options

- **Dagre's other ordering controls**: rejected, no gain.
  - `constraints` holds, but has nothing to fix. In 88 runs, each flipping one adjacent pair of steps in a rank, dagre's order and the canvas both kept the flip. But a constraint imposes an order chosen elsewhere, and choosing one is what the order by anchor already does for every rank at once.
  - `rankalign` moves no step, because every step is equally wide.
  - `disableOptimalOrderHeuristic` gives 179 / 19.
- **ELK**: deferred. ELK's layered layout with Galaxy's editor settings and orthogonal routing gives 76 / 0. It costs 433 kB gzipped and an asynchronous API, where dagre is synchronous and already a dependency. Revisit trigger: a dagre bump breaks this `customOrder` beyond repair, or inline subworkflows (the graph design's Q19) come back.
- **The author's own positions, *As authored***: rejected. They give 174 / 62, with 52 step–step overlaps at our step width. The graph design's Q6 had already declined them, because a layout made in another application's editor is not readable here.

## Consequences

- **The order reads labels private to dagre's layout graph**: each node's `rank` and `order`, and a dummy's `dummy` and `edgeObj`. Under one edge per connection, an edge's name is the connection's id, which is how a dummy is traced back to its connection and so to its anchors. Dagre's typings declare these labels, but nothing promises them, so a dagre bump can break the order without breaking the build. The ceilings are what catch it.
- **A route is only true of the layout it came from.** Each route carries where its two steps stood. A connection whose source or target a reader has dragged away is drawn as the live bezier between its anchors. Dragging stays on and positions stay unsaved, as Q6 decided, and a realtime refetch does not undo a drag.
- **One rule covers every connection without a usable route**: it draws the live bezier between its anchors. That is a connection between adjacent ranks, a connection whose step has been dragged, and every connection on a level laid out by the pair fallback, whose routes are shared per pair and would pinch parallel connections through one point. It also covers a connection whose route holds a point that is not finite: the layout is kept, and only that connection draws live.
- **#121's pair fallback stays as a safety net**, given the same order. It no longer runs on any recorded level, and whether to remove it is #133's to decide when dagre is bumped.
- **Some route pieces are steep.** The spike counted, over both directions, 24 of the 192 pieces the routed connections are drawn as that climb more than twice their run. The worst is fan-in's one six-rank connection top to bottom, at 10 times. The line still runs round every step.
- **A routed connection is named halfway along its route**, at the middle point of dagre's route. That point is on a rank when the connection spans an even number of ranks, and halfway between two when it spans an odd number. A connection between adjacent ranks is named where Vue Flow names its bezier.
- **The ceilings are the ratchet.** `workflowGraph.test.ts` pins each level's crossings and connections through a step as ceilings: 62 / 0 in all. A layout change or a dagre bump may lower them and never raise them, and a lowered count is pinned by hand.
