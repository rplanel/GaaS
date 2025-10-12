interface LayoutParams {
  width: Ref<number>
  height: Ref<number>
  marginTop?: Ref<number>
  marginBottom?: Ref<number>
  marginLeft?: Ref<number>
  marginRight?: Ref<number>
}

export function usePlotLayout(params: LayoutParams) {
  const { width, height, marginTop = 0, marginBottom = 0, marginLeft = 0, marginRight = 0 } = params

  const plotWidth = computed(() => {
    return width.value - toValue(marginLeft) - toValue(marginRight)
  })

  const plotHeight = computed(() => {
    return toValue(height) - toValue(marginTop) - toValue(marginBottom)
  })

  return {
    plotHeight,
    marginBottom,
    marginTop,
    marginRight,
    marginLeft,
    plotWidth,
  }
}
