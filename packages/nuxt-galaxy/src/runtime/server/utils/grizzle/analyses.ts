import type { serverSupabaseClient } from '#supabase/server'
import type { Datamap, GalaxyInvocation, GalaxyInvocationIO, GalaxyWorkflowInput, GalaxyWorkflowParameters, InvocationState, InvocationTerminalState } from 'blendtype'
import type { Database } from '../../../types/database'
import { deleteHistory, getDataset, getInvocation, InvocationTerminalStates, invokeWorkflow } from 'blendtype'
import { and, eq } from 'drizzle-orm'
import { analyses } from '../../db/schema/galaxy/analyses'
import { analysisInputs } from '../../db/schema/galaxy/analysisInputs'
import { histories } from '../../db/schema/galaxy/histories'
import { useDrizzle } from '../drizzle'
import { takeUniqueOrThrow } from './helper'
import { isHistorySync, synchronizeHistory } from './histories'

export async function runAnalysis(
  analysisName: string,
  galaxyHistoryId: string,
  galaxyWorkflowId: string,
  historyId: number,
  workflowId: number,
  ownerId: string,
  inputs: GalaxyWorkflowInput,
  parameters: GalaxyWorkflowParameters,
  datamap: Datamap,
): Promise<{
    id: undefined | number
    inputIds: number[] | undefined

  }> {
  const galaxyInvocation = await invokeWorkflow(
    galaxyHistoryId,
    galaxyWorkflowId,
    inputs,
    parameters,
  )
  const results: {
    id: undefined | number
    inputIds: number[] | undefined

  } = {
    id: undefined,
    inputIds: undefined,

  }
  const invocation = await getInvocation(galaxyInvocation.id)
  const values = {
    name: analysisName,
    historyId,
    workflowId,
    state: galaxyInvocation.state,
    galaxyId: galaxyInvocation.id,
    ownerId,
    parameters,
    datamap,
    invocation,
  }

  // add analysis
  const analsysis = await useDrizzle()
    .insert(analyses)
    .values(values)
    .returning({
      insertedId: analyses.id,
    })
    .then(takeUniqueOrThrow)
  if (analsysis) {
    const { insertedId: insertedAnalysisId } = analsysis
    results.id = insertedAnalysisId
    const inputsIds = await Promise.all(
      Object.entries(inputs).map(([_step, { dbid, id: galaxyDatasetId }]) => {
        if (dbid) {
          // get dataset states
          return getDataset(galaxyDatasetId, galaxyHistoryId).then(({ state }) => {
            return useDrizzle().insert(analysisInputs).values({
              analysisId: insertedAnalysisId,
              datasetId: dbid,
              state,
            }).returning({ insertedId: analysisInputs.id }).then(takeUniqueOrThrow)
          })
        }
        return undefined
      }),
    )
    results.inputIds = inputsIds
      .filter(input => input !== undefined)
      .map(({ insertedId }) => insertedId)
    // $fetch('/api/db/analyses/synchronize')
  }
  return results
}

export async function synchronizeAnalyses(supabaseClient: serverSupabaseClient<Database>, ownerId: string): Promise<void[]> {
  const analysesDb = await useDrizzle()
    .select()
    .from(analyses)
    .where(eq(analyses.ownerId, ownerId))

  return Promise.all(analysesDb.map(({ id: analysisId }) => {
    return synchronizeAnalysis(analysisId, supabaseClient, ownerId)
  }))
}

export async function synchronizeAnalysis(analysisId: number, supabaseClient: serverSupabaseClient<Database>, ownerId: string): Promise<void> {
  const invocationDb = await useDrizzle()
    .select()
    .from(analyses)
    .innerJoin(histories, eq(histories.id, analyses.historyId))
    .where(and(eq(analyses.id, analysisId), eq(analyses.ownerId, ownerId)))
    .then(takeUniqueOrThrow)

  // nothing to do
  if (invocationDb.analyses.isSync)
    return

  await synchronizeHistory(invocationDb.histories.id, ownerId, supabaseClient)

  if (!isAnalysisTerminalState(invocationDb.analyses.state)) {
    const galaxyInvocationId = invocationDb.analyses.galaxyId
    const invocation = await getInvocation(galaxyInvocationId)
    if (invocation.state !== invocationDb.analyses.state) {
      await useDrizzle()
        .update(analyses)
        .set({ state: invocation.state, invocation })
        .where(and(eq(analyses.id, analysisId), eq(analyses.ownerId, ownerId)))
    }
  }
  else {
    if (await isHistorySync(invocationDb.histories.id, analysisId, ownerId)) {
      // await synchronizeHistory(invocationDb.histories.id, ownerId, supabaseClient)
      await useDrizzle()
        .update(analyses)
        .set({ isSync: true })
        .where(and(eq(analyses.id, analysisId), eq(analyses.ownerId, ownerId)))
        .returning({ updatedState: analyses.state })
        .then(takeUniqueOrThrow)
      await deleteHistory(invocationDb.histories.galaxyId)
    }
  }
}

export function isAnalysisTerminalState(state: InvocationState): boolean {
  return InvocationTerminalStates.includes(state as InvocationTerminalState)
}

export async function getJobIdsWithOutputs(analysisId: number, ownerId: string): Promise<(string | null)[] | undefined> {
  const invocationDb = await useDrizzle()
    .select()
    .from(analyses)
    .where(and(eq(analyses.id, analysisId), eq(analyses.ownerId, ownerId)))
    .then(takeUniqueOrThrow)
  const analysisInvocationDb = invocationDb.invocation as GalaxyInvocation
  if (analysisInvocationDb?.outputs) {
    const outputDatasetsExpected = Object.values(analysisInvocationDb.outputs) as GalaxyInvocationIO[]
    const workflowStepIdsSet = new Set(outputDatasetsExpected.map(d => d.workflow_step_id))
    return analysisInvocationDb
      .steps
      .filter(step => workflowStepIdsSet
        .has(step.workflow_step_id),
      )
      .map(step => step.job_id)
  }
}

export async function getInvocationOutputs(analysisId: number, ownerId: string): Promise<Record<string, {
  galaxyDatasetIds: string[]
  galaxyJobId: string
  stepId: number
}> | undefined> {
  const invocationDb = await useDrizzle()
    .select()
    .from(analyses)
    .where(and(eq(analyses.id, analysisId), eq(analyses.ownerId, ownerId)))
    .then(takeUniqueOrThrow)
  const analysisInvocationDb = invocationDb.invocation as GalaxyInvocation
  if (analysisInvocationDb?.outputs) {
    const outputDatasetsExpected = Object.values(analysisInvocationDb.outputs) as GalaxyInvocationIO[]
    const stepToJob = new Map(analysisInvocationDb.steps.map(s => ([s.workflow_step_id, { jobId: s.job_id, stepId: s.order_index }])))
    const jobsWithOutputs = outputDatasetsExpected.reduce((acc, curr) => {
      const jobInfo = stepToJob.get(curr.workflow_step_id)
      if (jobInfo?.jobId) {
        const { jobId, stepId } = jobInfo
        if (!acc?.[jobId]) {
          acc[jobId] = { galaxyDatasetIds: [curr.id], galaxyJobId: jobId, stepId }
        }
        else {
          const jobIdFromAcc = acc?.[jobId]
          if (jobIdFromAcc !== undefined)
            jobIdFromAcc.galaxyDatasetIds.push(curr.id)
        }
      }
      return acc
    }, {} as Record<string, { galaxyDatasetIds: string[], galaxyJobId: string, stepId: number }>)
    return jobsWithOutputs
  }
}
