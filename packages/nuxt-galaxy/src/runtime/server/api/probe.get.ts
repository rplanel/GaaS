import { useLogger } from 'evlog'
import { defineEventHandler } from 'h3'

export default defineEventHandler(async (event) => {
  const log = useLogger(event)
  log.set({ handler: 'probe' })
  log.info('probe:ok')
  return 'ok'
})
