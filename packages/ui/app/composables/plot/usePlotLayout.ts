interface LayoutParams {
  width: Ref<number>
  height: Ref<number>
  marginTop?: Ref<number>
  marginBottom?: Ref<number>
  marginLeft?: Ref<number>
  marginRight?: Ref<number>
}

export function usePlotLayout(params: LayoutParams) {
  const { width, height, marginTop = ref(0), marginBottom = ref(0), marginLeft = ref(0), marginRight = ref(0) } = params

  const plotWidth = computed(() => {
    return toValue(width) - toValue(marginLeft) - toValue(marginRight)
  })

  const plotHeight = computed(() => {
    return toValue(height) - toValue(marginTop) - toValue(marginBottom)
  })

  function increaseMarginTop(amount: number) {
    marginTop.value += amount
  }
  function decreaseMarginTop(amount: number) {
    marginTop.value = Math.max(0, marginTop.value - amount)
  }

  return {

    plotHeight,
    marginBottom,
    marginTop,
    marginRight,
    marginLeft,
    plotWidth,
    // functions
    increaseMarginTop,
    decreaseMarginTop,
  }
}
