import type { Ref } from 'vue'
import { tsvParse } from 'd3-dsv'
import { computed, toValue } from 'vue'
import { useParse } from './useParse'

export function useParseTsv(text: Ref<string | undefined>) {
  const { lines, comments, results } = useParse(text)

  const parsedResults = computed(() => {
    const resultsVal = toValue(results)
    if (resultsVal) {
      return tsvParse(resultsVal)
    }
  })
  return {
    lines,
    comments,
    results,
    parsedResults,
  }
}
