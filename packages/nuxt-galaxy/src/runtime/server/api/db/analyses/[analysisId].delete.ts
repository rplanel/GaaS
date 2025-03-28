import { deleteHistory, getErrorMessage, getStatusCode } from 'blendtype'
import { eq } from 'drizzle-orm'
import { createError, defineEventHandler, getRouterParam } from 'h3'
import { analyses } from '../../../db/schema/galaxy/analyses'
import { histories } from '../../../db/schema/galaxy/histories'
import { useDrizzle } from '../../../utils/drizzle'
import { takeUniqueOrThrow } from '../../../utils/grizzle/helper'

export default defineEventHandler(
  async (event) => {
    const analysisId = (getRouterParam(event, 'analysisId'))
    if (analysisId) {
      try {
        const analysisDb = await useDrizzle()
          .select()
          .from(analyses)
          .innerJoin(histories, eq(analyses.historyId, histories.id))
          .where(eq(analyses.id, Number.parseInt(analysisId)))
          .then(takeUniqueOrThrow)

        // delete galaxy history
        await deleteHistory(analysisDb.histories.galaxyId)
        await useDrizzle().delete(histories).where(eq(histories.id, analysisDb.histories.id)).returning()
        return analysisDb
      }
      catch (error) {
        throw createError({ statusMessage: getErrorMessage(error), statusCode: getStatusCode(error) })
      }
    }
  },
)
