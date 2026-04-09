# AGENTS.md - LLM Utilities Package

## Section 1: Stack Definition With Exact Versions

**Status**: Placeholder package - Implementation pending

| Component | Version | Purpose |
|-----------|---------|---------|
| **Status** | Not Started | LLM integrations |

### Package State
- **Created**: Package structure exists but no implementation
- **Purpose**: LLM integrations and utilities
- **Dependencies**: TBD based on chosen LLM provider

## Section 2: Executable Commands With Full Flags

**Note**: This package has no defined scripts. Define in package.json when ready.

### Planned Commands (Template)
```bash
# Development
pnpm dev                    # Dev server (if applicable)
pnpm lint                   # ESLint
cd ../.. && pnpm test -w packages/llm  # Test from root
```

## Section 3: Coding Conventions and Patterns

### Package Type Decision Needed
Choose ONE before implementation:

**Option A: TypeScript/Nuxt Module**
- Follow nuxt-galaxy patterns
- Use `defineNuxtModule()` if Nuxt integration
- Runtime directory structure
- Dependencies from `catalog:nuxt`

**Option B: TypeScript Library**
- Follow blendtype patterns
- Effect-TS functional style
- Dual Effect/Promise exports
- Dependencies from main `catalog:`

**Option C: Python Package**
- Follow gaas-cli patterns
- Typer CLI or FastAPI service
- Pydantic models
- Dependencies managed with uv

### When Implementing
1. Create `package.json` or `pyproject.toml`
2. Add to root `pnpm-workspace.yaml`
3. Define clear purpose and APIs
4. Document integration points with other packages

## Section 4: Testing Rules

**Current**: No tests (package empty)

### When Ready
```bash
# TypeScript
pnpm test                   # Vitest
pnpm test:watch             # Watch mode

# Python
pytest                      # pytest
pytest --cov=<package>      # With coverage

# From root
cd ../.. && pnpm test -w packages/llm
```

## Section 5: "Don't Touch" Zones and Permission Boundaries

### Protected Areas
1. `.playground/` - Development environment for testing
2. `node_modules/` - Installed dependencies

### Implementation Guidelines
- **DO**: Define clear API boundaries
- **DO**: Choose ONE: TypeScript library, Nuxt module, or Python package
- **DO**: Document expected integrations with:
  - blendtype (for Galaxy API context in prompts)
  - nuxt-galaxy (for user/session context)
  - gaas-cli (for CLI automation)
- **DON'T**: Mix implementation languages
- **DON'T**: Create unstructured utilities

### Package Decision Checklist
Before implementation, decide:
- [ ] Language: TypeScript or Python?
- [ ] Runtime: Nuxt integration or standalone?
- [ ] LLM Provider: OpenAI, Ollama, custom?
- [ ] Use cases: Content generation, code analysis, search?
- [ ] Dependencies: Effect-TS, LangChain, or custom?

### Suggested Structure (when ready)
```
packages/llm/
├── src/                    # Source code
│   ├── index.ts           # Exports
│   └── ...                # Implementation
├── tests/                  # Test files
├── package.json           # Define here
└── AGENTS.md              # This file (update when ready)
```
