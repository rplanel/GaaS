import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { toWorkflowComponentName } from '../../../nuxt-galaxy/src/runtime/app/utils/workflowSlug'
import { useWorkflowResultResolver } from '../../app/composables/useWorkflowResultResolver'

describe('useWorkflowResultResolver', () => {
  it('computes componentName from a plain string slug', () => {
    const slug = 'my-tool-1'
    const { componentName } = useWorkflowResultResolver({ workflowSlug: slug })
    expect(componentName.value).toBe(`WorkflowResult${toWorkflowComponentName(slug)}`)
  })

  it('computes componentName from a Ref<string> slug', () => {
    const slug = ref('my-tool-1')
    const { componentName } = useWorkflowResultResolver({ workflowSlug: slug })
    expect(componentName.value).toBe('WorkflowResultMyTool1')
  })

  it('computes componentName with a custom prefix', () => {
    const slug = 'my-tool-1'
    const { componentName } = useWorkflowResultResolver({ workflowSlug: slug, prefix: 'Workflows' })
    expect(componentName.value).toBe(`Workflows${toWorkflowComponentName(slug)}`)
  })

  it('sanitizes workflow slugs with dots and hyphens correctly', () => {
    const slug = 'my-tool-2.0.0-galaxy1'
    const { componentName } = useWorkflowResultResolver({ workflowSlug: slug })
    expect(componentName.value).toBe(`WorkflowResult${toWorkflowComponentName(slug)}`)
  })

  it('falls back to generic component when no custom component exists', () => {
    const slug = 'my-tool-1'
    const { component, isCustom } = useWorkflowResultResolver({ workflowSlug: slug })
    expect(isCustom.value).toBe(false)
    expect(component.value).toBe('WorkflowResultGeneric')
  })
})
