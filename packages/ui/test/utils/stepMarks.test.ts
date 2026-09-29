/**
 * What each step of a running invocation is drawn as (#90).
 *
 * Pure, and tested without a canvas, because what has to be right here is a
 * claim about a function: that a step which ran nothing is never confused
 * with one that ran something and was skipped, that a step which *cannot*
 * run anything is never drawn as waiting, and that a mapped step's badge
 * accounts for every one of its jobs rather than for the last row to arrive.
 *
 * The job rows are this application's own, as `analysisByIdWithDetailsQuery`
 * serves them — `step_id` is the step's `order_index`, the same key the
 * canvas gives its nodes.
 */

import type { JobState } from 'blendtype'
import type { MarkableJob } from '../../app/utils/stepMarks'
import { describe, expect, it } from 'vitest'
import { stepMarks, stepMarkSummary } from '../../app/utils/stepMarks'
import { aStep } from '../describedSteps'

/** One recorded job row, reduced to the two fields a mark is derived from. */
function aJob(stepId: number, state: JobState): MarkableJob {
  return { step_id: stepId, state }
}

/** A tool step at 0 and whatever else the case needs. */
function steps(...over: { id: number, type?: 'tool' | 'data_input' | 'parameter_input' | 'data_collection_input' | 'subworkflow' }[]) {
  const described: Record<string, ReturnType<typeof aStep>> = {}
  for (const { id, type } of over) {
    described[String(id)] = aStep(id, type === undefined ? {} : { type })
  }
  return described
}

describe('stepMarks', () => {
  it('marks every step of the revision, so the canvas never has to guess', () => {
    const marks = stepMarks(
      steps({ id: 0, type: 'data_input' }, { id: 1 }, { id: 2 }),
      [aJob(1, 'ok')],
    )

    expect(Object.keys(marks)).toEqual(['0', '1', '2'])
  })

  describe('a step that runs no job of its own', () => {
    // The whole of AC6. An input is *provided*, not pending: derived from job
    // rows alone it would read "not started" for the entire invocation,
    // because Galaxy never runs a job for one. A subworkflow step is the same
    // by a different route — its jobs belong to a separate invocation this
    // application does not record at all (#119).
    it.each([
      ['data_input'],
      ['parameter_input'],
      ['data_collection_input'],
      ['subworkflow'],
    ] as const)('is unmarked rather than Not started: %s', (type) => {
      const marks = stepMarks(steps({ id: 0, type }), [])

      expect(marks['0']?.state).toBe('unmarked')
      expect(marks['0']?.isRunning).toBe(false)
      expect(marks['0']?.total).toBe(0)
    })

    it('stays unmarked even if a job row somehow names it', () => {
      const marks = stepMarks(steps({ id: 0, type: 'subworkflow' }), [aJob(0, 'running')])

      expect(marks['0']?.state).toBe('unmarked')
      expect(marks['0']?.isRunning).toBe(false)
    })
  })

  describe('a step that could run a job', () => {
    it('is Not started while it has none recorded', () => {
      const marks = stepMarks(steps({ id: 0 }), [])

      expect(marks['0']?.state).toBe('notStarted')
      expect(marks['0']?.total).toBe(0)
    })

    it('is Not started, not Skipped, when nothing ran — these are different things', () => {
      const marks = stepMarks(steps({ id: 0 }, { id: 1 }), [aJob(1, 'skipped')])

      // AC4: a conditional Galaxy declined to run writes a real job row in
      // state `skipped` (`tools/actions/__init__.py:755`); a step whose turn
      // has not come writes nothing at all.
      expect(marks['0']?.state).toBe('notStarted')
      expect(marks['1']?.state).toBe('skipped')
    })

    it('is drawn as paused when Galaxy paused its job', () => {
      // AC5. Galaxy pauses a job whose input dataset is paused or errored
      // (`jobs/handler.py:594`), which is the only paused a published
      // workflow can reach — the `pause` step type cannot be published at
      // all (#118).
      const marks = stepMarks(steps({ id: 0 }), [aJob(0, 'paused')])

      expect(marks['0']?.state).toBe('paused')
      expect(marks['0']?.isRunning).toBe(false)
    })

    it.each([
      ['new', 'queued'],
      ['waiting', 'queued'],
      ['queued', 'queued'],
      ['resubmitted', 'queued'],
      ['upload', 'queued'],
      ['running', 'running'],
      ['paused', 'paused'],
      ['skipped', 'skipped'],
      ['ok', 'succeeded'],
      ['error', 'failed'],
      ['failed', 'failed'],
      ['stop', 'failed'],
      ['stopped', 'failed'],
      ['deleted', 'cancelled'],
      ['deleting', 'cancelled'],
    ] as const)('reads a lone %s job as the step state %s', (state, stepState) => {
      expect(stepMarks(steps({ id: 0 }), [aJob(0, state)])['0']?.state).toBe(stepState)
    })

    it('animates the edges leaving it only while it is running', () => {
      // AC2 reads `isRunning` and nothing else, so a queued step must not
      // answer to it: an animated edge out of a step that has not started is
      // the graph saying something is flowing when nothing is.
      const marks = stepMarks(steps({ id: 0 }, { id: 1 }, { id: 2 }), [
        aJob(0, 'running'),
        aJob(1, 'queued'),
        aJob(2, 'ok'),
      ])

      expect(marks['0']?.isRunning).toBe(true)
      expect(marks['1']?.isRunning).toBe(false)
      expect(marks['2']?.isRunning).toBe(false)
    })
  })

  describe('a mapped step', () => {
    /** One step, thirty elements: twelve finished, three running, fifteen queued. */
    const mapped = [
      ...Array.from({ length: 12 }, () => aJob(0, 'ok')),
      ...Array.from({ length: 3 }, () => aJob(0, 'running')),
      ...Array.from({ length: 15 }, () => aJob(0, 'queued')),
    ]

    it('counts every one of its jobs', () => {
      // AC3, and the reason #84 had to land first: before it, a step that
      // mapped over thirty inputs recorded nothing at all.
      const mark = stepMarks(steps({ id: 0 }), mapped)['0']

      expect(mark?.total).toBe(30)
      expect(mark?.counts).toEqual([
        { state: 'succeeded', count: 12 },
        { state: 'running', count: 3 },
        { state: 'queued', count: 15 },
      ])
    })

    it('takes the most telling of its states as the one it is drawn in', () => {
      const stateOf = (jobs: MarkableJob[]) => stepMarks(steps({ id: 0 }), jobs)['0']?.state

      expect(stateOf(mapped)).toBe('running')
      expect(stateOf([aJob(0, 'ok'), aJob(0, 'error')])).toBe('failed')
      expect(stateOf([aJob(0, 'running'), aJob(0, 'error')])).toBe('failed')
      expect(stateOf([aJob(0, 'ok'), aJob(0, 'paused')])).toBe('paused')
      expect(stateOf([aJob(0, 'ok'), aJob(0, 'skipped')])).toBe('skipped')
      expect(stateOf([aJob(0, 'ok'), aJob(0, 'ok')])).toBe('succeeded')
      // Two of Galaxy's job states, one step state: a step with an errored
      // job and a stopped one has two failures, not one of each.
      expect(stepMarks(steps({ id: 0 }), [aJob(0, 'error'), aJob(0, 'stopped')])['0']?.counts)
        .toEqual([{ state: 'failed', count: 2 }])
    })
  })

  it('ignores a job row naming a step this revision does not declare', () => {
    // Reachable when the revision being described is not the one that ran —
    // an analysis started before #48 recorded none, and the workflow row's
    // pinned revision stands in. Dropping the row is right; throwing on it
    // would cost the reader the whole canvas.
    const marks = stepMarks(steps({ id: 0 }), [aJob(0, 'ok'), aJob(99, 'error')])

    expect(Object.keys(marks)).toEqual(['0'])
    expect(marks['0']?.state).toBe('succeeded')
  })

  it('reads an absent job list as no jobs at all', () => {
    // `AnalysisHistoryPanel` hands `undefined` while the analysis is still
    // being fetched, and an empty canvas is not the moment to throw.
    const marks = stepMarks(steps({ id: 0 }), undefined)

    expect(marks['0']?.state).toBe('notStarted')
  })
})

describe('stepMarkSummary', () => {
  it('says what a mapped step is doing, accounting for every job', () => {
    const mark = stepMarks(steps({ id: 0 }), [
      ...Array.from({ length: 12 }, () => aJob(0, 'ok')),
      ...Array.from({ length: 3 }, () => aJob(0, 'running')),
    ])['0']!

    // The Succeeded count leads as a fraction so the total is always on the
    // badge; the rest follow as plain counts. A badge that named only some
    // of the states would be the count read as the whole of a step again.
    // In the glossary's words throughout — `12/15 ok, 3 running` put two
    // Galaxy identifiers on the node.
    expect(stepMarkSummary(mark)).toBe('12/15 Succeeded, 3 Running')
  })

  it('leads with the total even when nothing has finished', () => {
    const mark = stepMarks(steps({ id: 0 }), Array.from({ length: 30 }, () => aJob(0, 'queued')))['0']!

    expect(stepMarkSummary(mark)).toBe('0/30 Succeeded, 30 Queued')
  })

  it('says nothing for a step with one job or none', () => {
    // A single job's state is already the node's colour, and a badge reading
    // "1/1 Succeeded" beside it is noise.
    const marks = stepMarks(steps({ id: 0 }, { id: 1 }, { id: 2, type: 'data_input' }), [aJob(0, 'ok')])

    expect(stepMarkSummary(marks['0']!)).toBeNull()
    expect(stepMarkSummary(marks['1']!)).toBeNull()
    expect(stepMarkSummary(marks['2']!)).toBeNull()
  })
})
