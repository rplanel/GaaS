declare module 'htl' {
  export function html(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): HTMLElement | DocumentFragment

  export function svg(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): SVGElement | null
}
