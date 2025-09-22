import type { Ref } from 'vue'
import { csvParse } from 'd3-dsv'
import { computed, toValue } from 'vue'

export function useParseCsv(text: Ref<string | undefined>) {
  const lines = computed(() => {
    const textVal = toValue(text)
    if (!textVal)
      return []
    return textVal.split('\n')
  })

  const comments = computed(() => {
    return lines.value.filter(line => line.trim() && line.startsWith('#'))
      .map(line => line.substring(1).trim()) // Remove # and trim
  })
  const results = computed(() => {
    const arr = lines.value.filter((line) => {
      const trimmedLine = line.trim()
      return trimmedLine && trimmedLine !== '' && !line.startsWith('#')
    })
    return arr.join('\n')
  })

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
