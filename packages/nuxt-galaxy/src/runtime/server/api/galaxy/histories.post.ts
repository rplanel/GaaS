import { createHistory } from 'blendtype'

import { defineEventHandler, readBody } from 'h3'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  return createHistory(body.name)
})
