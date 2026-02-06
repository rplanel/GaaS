import { defineRelations } from 'drizzle-orm'
import { analyses } from '../galaxy/analyses'
import { datasets } from '../galaxy/datasets'
import { histories } from '../galaxy/histories'
import { uploadedDatasets } from '../galaxy/uploadedDatasets'
import { userRoles } from '../galaxyRbac/userRoles'
import { users } from './users'

export const usersRelations = defineRelations({ users, analyses, datasets, uploadedDatasets, histories, userRoles }, r => ({
  users: {
    analyses: r.many.analyses({
      from: r.users.id,
      to: r.analyses.ownerId,
    }),
    datasets: r.many.datasets({
      from: r.users.id,
      to: r.datasets.ownerId,
    }),
    uploadedDatasets: r.many.uploadedDatasets({
      from: r.users.id,
      to: r.uploadedDatasets.ownerId,
    }),
    histories: r.many.histories({
      from: r.users.id,
      to: r.histories.ownerId,
    }),
    role: r.one.userRoles({
      from: r.users.id,
      to: r.userRoles.userId,
    }),
  },
}))
