import { getWorkflows } from 'blendtype'
import { defineEventHandler } from 'h3'
import { useGalaxyLayer } from '../../utils/galaxy'

export default defineEventHandler(async () => {
  return getWorkflows(useGalaxyLayer())
})
