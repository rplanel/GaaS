import type { Ref } from 'vue'
import { csvParse } from 'd3-dsv'
import { computed, toValue } from 'vue'
import { useParse } from './useParse'

export function useParseCsv(text: Ref<string | undefined>) {
  const { lines, comments, results } = useParse(text)

  const parsedResults = computed(() => {
    const resultsVal = toValue(results)

    if (resultsVal) {
      return csvParse(resultsVal)
    }
  })
  return {
    lines,
    comments,
    results,
    parsedResults,
  }
}
