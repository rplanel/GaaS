import { defineRelations } from 'drizzle-orm'
import { users as owners } from '../auth/users'
import { objects } from '../storage/objects'
import { analyses } from './analyses'
import { analysisInputs } from './analysisInputs'
import { analysisOutputs, analysisOutputsToTags } from './analysisOutputs'
import { datasets, datasetsToTags } from './datasets'
import { histories } from './histories'
import { instances } from './instances'
import { jobs } from './jobs'
import { tags } from './tags'
import { uploadedDatasets } from './uploadedDatasets'
import { users } from './users'
import { workflows, workflowsToTags } from './workflows'

export const jobsRelations = defineRelations({ jobs, analysisOutputs, analyses }, r => ({
  jobs: {
    outputs: r.many.analysisOutputs({
      from: r.jobs.id,
      to: r.analysisOutputs.jobId,
    }),
    analysis: r.one.analyses({
      from: r.jobs.analysisId,
      to: r.analyses.id,
    }),
  },
}))

export const historiesRelations = defineRelations({ histories, users, owners, analyses, datasets }, r => ({
  histories: {
    user: r.one.users({
      from: r.histories.userId,
      to: r.users.id,
    }),
    owner: r.one.owners({
      from: r.histories.ownerId,
      to: r.owners.id,
    }),
    analysis: r.one.analyses({
      from: r.histories.id,
      to: r.analyses.historyId,
    }),
    datasets: r.many.datasets({
      from: r.histories.id,
      to: r.datasets.historyId,
    }),
  },
  owners: {
    histories: r.many.histories({
      from: r.owners.id,
      to: r.histories.ownerId,
    }),
  },
}))

export const datasetsRelations = defineRelations(
  { datasets, datasetsToTags, analysisInputs, analysisOutputs, owners, histories, objects },
  r => ({
    datasets: {
      datasetTags: r.many.datasetsToTags({
        from: r.datasets.id,
        to: r.datasetsToTags.datasetId,
      }),
      analysisInput: r.one.analysisInputs({
        from: r.datasets.id,
        to: r.analysisInputs.datasetId,
      }),
      analysisOuput: r.one.analysisOutputs({
        from: r.datasets.id,
        to: r.analysisOutputs.datasetId,
      }),
      owner: r.one.owners({
        from: r.datasets.ownerId,
        to: r.owners.id,
      }),
      history: r.one.histories({
        from: r.datasets.historyId,
        to: r.histories.id,
      }),
      storageObject: r.one.objects({
        from: r.datasets.storageObjectId,
        to: r.objects.id,
      }),
    },
    owners: {
      datasets: r.many.datasets({
        from: r.owners.id,
        to: r.datasets.ownerId,
      }),
    },
  }),
)

export const datasetsToTagsRelations = defineRelations({ datasetsToTags, datasets, tags }, r => ({
  datasetsToTags: {
    dataset: r.one.datasets({
      from: r.datasetsToTags.datasetId,
      to: r.datasets.id,
    }),
    tag: r.one.tags({
      from: r.datasetsToTags.tagId,
      to: r.tags.id,
    }),
  },
}))

export const analysesRelations = defineRelations(
  {
    analyses,
    workflows,
    owners,
    histories,
    analysisInputs,
    analysisOutputs,
    jobs,
  },
  r => ({
    analyses: {
      workflow: r.one.workflows({
        from: r.analyses.workflowId,
        to: r.workflows.id,
      }),
      owner: r.one.owners({
        from: r.analyses.ownerId,
        to: r.owners.id,
      }),
      history: r.one.histories({
        from: r.analyses.historyId,
        to: r.histories.id,
      }),
      analysisInputs: r.many.analysisInputs({
        from: r.analyses.id,
        to: r.analysisInputs.analysisId,
      }),
      analysisOutputs: r.many.analysisOutputs({
        from: r.analyses.id,
        to: r.analysisOutputs.analysisId,
      }),
      jobs: r.many.jobs({
        from: r.analyses.id,
        to: r.jobs.analysisId,
      }),
    },
    owners: {
      analyses: r.many.analyses({
        from: r.owners.id,
        to: r.analyses.ownerId,
      }),
    },
  }),
)

export const workflowsRelations = defineRelations({ workflows, users, workflowsToTags, analyses }, r => ({
  workflows: {
    user: r.one.users({
      from: r.workflows.userId,
      to: r.users.id,
    }),
    workflowTags: r.many.workflowsToTags({
      from: r.workflows.id,
      to: r.workflowsToTags.workflowId,
    }),
    analyses: r.many.analyses({
      from: r.workflows.id,
      to: r.analyses.workflowId,
    }),
  },
}))

export const workflowsToTagsRelations = defineRelations({ workflowsToTags, workflows, tags }, r => ({
  workflowsToTags: {
    workflow: r.one.workflows({
      from: r.workflowsToTags.workflowId,
      to: r.workflows.id,
    }),
    tag: r.one.tags({
      from: r.workflowsToTags.tagId,
      to: r.tags.id,
    }),
  },
}))

export const usersRelations = defineRelations({ users, instances, workflows, histories }, r => ({
  users: {
    instance: r.one.instances({
      from: r.users.instanceId,
      to: r.instances.id,
    }),

    workflows: r.many.workflows({
      from: r.users.id,
      to: r.workflows.userId,
    }),
    histories: r.many.histories({
      from: r.users.id,
      to: r.histories.ownerId,
    }),
  },
}))

export const uploadedDatasetsRelations = defineRelations({ uploadedDatasets, owners, objects }, r => ({
  uploadedDatasets: {
    owner: r.one.owners({
      from: r.uploadedDatasets.ownerId,
      to: r.owners.id,
    }),
    storageObject: r.one.objects({
      from: r.uploadedDatasets.storageObjectId,
      to: r.objects.id,
    }),
  },
  owners: {
    uploadedDatasets: r.many.uploadedDatasets({
      from: r.owners.id,
      to: r.uploadedDatasets.ownerId,
    }),
  },
}))

export const tagsRelations = defineRelations(
  { tags, workflowsToTags, datasetsToTags, analysisOutputsToTags },
  r => ({
    tags: {
      workflows: r.many.workflowsToTags({
        from: r.tags.id,
        to: r.workflowsToTags.tagId,
      }),
      datasets: r.many.datasetsToTags({
        from: r.tags.id,
        to: r.datasetsToTags.tagId,
      }),
      analysisOutputs: r.many.analysisOutputsToTags({
        from: r.tags.id,
        to: r.analysisOutputsToTags.tagId,
      }),
    },
  }),
)

export const instancesRelations = defineRelations({ instances, users }, r => ({
  instances: {
    users: r.many.users({
      from: r.instances.id,
      to: r.users.instanceId,
    }),
  },
}))

export const analysisOutputsRelations = defineRelations(
  { analysisOutputs, analyses, datasets, jobs, analysisOutputsToTags },
  r => ({
    analysisOutputs: {
      dataset: r.one.datasets({
        from: r.analysisOutputs.datasetId,
        to: r.datasets.id,
      }),
      analysis: r.one.analyses({
        from: r.analysisOutputs.analysisId,
        to: r.analyses.id,
      }),
      job: r.one.jobs({
        from: r.analysisOutputs.jobId,
        to: r.jobs.id,
      }),
      analysisOutputsTags: r.many.analysisOutputsToTags({
        from: r.analysisOutputs.id,
        to: r.analysisOutputsToTags.analysisOutputId,
      }),
    },
  }),
)

export const analysisInputsRelations = defineRelations({ analysisInputs, analyses, datasets }, r => ({
  analysisInputs: {
    dataset: r.one.datasets({
      from: r.analysisInputs.datasetId,
      to: r.datasets.id,
    }),
    analysis: r.one.analyses({
      from: r.analysisInputs.analysisId,
      to: r.analyses.id,
    }),
  },
}))
