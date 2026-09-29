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
    ] as const)('is unmarked rather than pending: %s', (type) => {
      const marks = stepMarks(steps({ id: 0, type }), [])

      expect(marks['0']?.phase).toBe('unmarked')
      expect(marks['0']?.isRunning).toBe(false)
      expect(marks['0']?.total).toBe(0)
    })

    it('stays unmarked even if a job row somehow names it', () => {
      const marks = stepMarks(steps({ id: 0, type: 'subworkflow' }), [aJob(0, 'running')])

      expect(marks['0']?.phase).toBe('unmarked')
      expect(marks['0']?.isRunning).toBe(false)
    })
  })

  describe('a step that could run a job', () => {
    it('is pending while it has none recorded', () => {
      const marks = stepMarks(steps({ id: 0 }), [])

      expect(marks['0']?.phase).toBe('pending')
      expect(marks['0']?.total).toBe(0)
    })

    it('is pending, not skipped, when nothing ran — these are different things', () => {
      const marks = stepMarks(steps({ id: 0 }, { id: 1 }), [aJob(1, 'skipped')])

      // AC4: a conditional Galaxy declined to run writes a real job row in
      // state `skipped` (`tools/actions/__init__.py:755`); a step whose turn
      // has not come writes nothing at all.
      expect(marks['0']?.phase).toBe('pending')
      expect(marks['1']?.phase).toBe('skipped')
    })

    it('is drawn as paused when Galaxy paused its job', () => {
      // AC5. Galaxy pauses a job whose input dataset is paused or errored
      // (`jobs/handler.py:594`), which is the only paused a published
      // workflow can reach — the `pause` step type cannot be published at
      // all (#118).
      const marks = stepMarks(steps({ id: 0 }), [aJob(0, 'paused')])

      expect(marks['0']?.phase).toBe('paused')
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
      ['ok', 'ok'],
      ['error', 'error'],
      ['failed', 'error'],
      ['stop', 'error'],
      ['stopped', 'error'],
      ['deleted', 'deleted'],
      ['deleting', 'deleted'],
    ] as const)('draws a lone %s job as %s', (state, phase) => {
      expect(stepMarks(steps({ id: 0 }), [aJob(0, state)])['0']?.phase).toBe(phase)
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
        { state: 'ok', count: 12 },
        { state: 'running', count: 3 },
        { state: 'queued', count: 15 },
      ])
    })

    it('takes the most telling of its states as the one it is drawn in', () => {
      const phaseOf = (jobs: MarkableJob[]) => stepMarks(steps({ id: 0 }), jobs)['0']?.phase

      expect(phaseOf(mapped)).toBe('running')
      expect(phaseOf([aJob(0, 'ok'), aJob(0, 'error')])).toBe('error')
      expect(phaseOf([aJob(0, 'running'), aJob(0, 'error')])).toBe('error')
      expect(phaseOf([aJob(0, 'ok'), aJob(0, 'paused')])).toBe('paused')
      expect(phaseOf([aJob(0, 'ok'), aJob(0, 'skipped')])).toBe('skipped')
      expect(phaseOf([aJob(0, 'ok'), aJob(0, 'ok')])).toBe('ok')
    })
  })

  it('ignores a job row naming a step this revision does not declare', () => {
    // Reachable when the revision being described is not the one that ran —
    // an analysis started before #48 recorded none, and the workflow row's
    // pinned revision stands in. Dropping the row is right; throwing on it
    // would cost the reader the whole canvas.
    const marks = stepMarks(steps({ id: 0 }), [aJob(0, 'ok'), aJob(99, 'error')])

    expect(Object.keys(marks)).toEqual(['0'])
    expect(marks['0']?.phase).toBe('ok')
  })

  it('reads an absent job list as no jobs at all', () => {
    // `AnalysisHistoryPanel` hands `undefined` while the analysis is still
    // being fetched, and an empty canvas is not the moment to throw.
    const marks = stepMarks(steps({ id: 0 }), undefined)

    expect(marks['0']?.phase).toBe('pending')
  })
})

describe('stepMarkSummary', () => {
  it('says what a mapped step is doing, accounting for every job', () => {
    const mark = stepMarks(steps({ id: 0 }), [
      ...Array.from({ length: 12 }, () => aJob(0, 'ok')),
      ...Array.from({ length: 3 }, () => aJob(0, 'running')),
    ])['0']!

    // The `ok` count leads as a fraction so the total is always on the badge;
    // the rest follow as plain counts. A badge that named only some of the
    // states would be the count read as the whole of a step again.
    expect(stepMarkSummary(mark)).toBe('12/15 ok, 3 running')
  })

  it('leads with the total even when nothing has finished', () => {
    const mark = stepMarks(steps({ id: 0 }), Array.from({ length: 30 }, () => aJob(0, 'queued')))['0']!

    expect(stepMarkSummary(mark)).toBe('0/30 ok, 30 queued')
  })

  it('says nothing for a step with one job or none', () => {
    // A single job's state is already the node's colour, and a badge reading
    // "1/1 ok" beside it is noise.
    const marks = stepMarks(steps({ id: 0 }, { id: 1 }, { id: 2, type: 'data_input' }), [aJob(0, 'ok')])

    expect(stepMarkSummary(marks['0']!)).toBeNull()
    expect(stepMarkSummary(marks['1']!)).toBeNull()
    expect(stepMarkSummary(marks['2']!)).toBeNull()
  })
})
