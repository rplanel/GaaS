<template>
  <!--
    The GaaS mark: a G drawn as a workflow graph, an input at the top right,
    three steps and the result at the crossbar, the steps as bubbles.
    Colours come from the theme so it follows the colour mode. The source of
    the full logo (wordmark, cloud, favicon) lives in docs/public/.
  -->
  <svg
    viewBox="-112.5 -112.5 225 225"
    aria-hidden="true"
    focusable="false"
  >
    <g
      fill="none"
      stroke-width="24"
      stroke-linecap="round"
      class="stroke-(--ui-color-primary-400) dark:stroke-(--ui-color-primary-300)"
    >
      <path d="M 32.1 -84.6 A 90.5 90.5 0 0 0 -30.2 -85.3" />
      <path d="M -85.3 -30.2 A 90.5 90.5 0 0 0 -85.3 30.2" />
      <path d="M -30.2 85.3 A 90.5 90.5 0 0 0 30.2 85.3" />
      <path d="M 85.3 30.2 A 90.5 90.5 0 0 0 90.5 0" />
      <path d="M 90.5 0 L 58.1 0" />
    </g>
    <g
      stroke-width="3"
      class="fill-(--ui-color-primary-100) stroke-(--ui-color-primary-500) dark:fill-white/15 dark:stroke-(--ui-color-primary-300)"
    >
      <circle cx="-64" cy="-64" r="21" />
      <circle cx="-64" cy="64" r="21" />
      <circle cx="64" cy="64" r="21" />
    </g>
    <circle
      cx="64"
      cy="-64"
      r="16"
      fill="none"
      stroke-width="3"
      class="stroke-(--ui-color-primary-500) dark:stroke-(--ui-color-primary-300)"
    />
    <circle cx="18.1" cy="0" r="21" class="fill-(--ui-text-highlighted)" />
    <g fill="white">
      <ellipse cx="-71.3" cy="-72.4" rx="6.7" ry="3.8" transform="rotate(-35 -71.3 -72.4)" />
      <ellipse cx="-71.3" cy="55.6" rx="6.7" ry="3.8" transform="rotate(-35 -71.3 55.6)" />
      <ellipse cx="56.6" cy="55.6" rx="6.7" ry="3.8" transform="rotate(-35 56.6 55.6)" />
      <ellipse cx="58.4" cy="-70.4" rx="5.1" ry="2.9" transform="rotate(-35 58.4 -70.4)" />
      <ellipse cx="10.8" cy="-8.4" rx="6.7" ry="3.8" transform="rotate(-35 10.8 -8.4)" />
    </g>
  </svg>
</template>
