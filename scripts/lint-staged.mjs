import { execSync } from 'node:child_process'
import { relative } from 'node:path'
import process from 'node:process'

const files = process.argv.slice(2)
const groups = new Map()
const rootFiles = []

for (const absolute of files) {
  const rel = relative(process.cwd(), absolute)
  const match = rel.match(/^(packages\/[^/]+|docs|playground)(?:\/|$)/)
  if (match) {
    const pkg = match[1]
    if (!groups.has(pkg))
      groups.set(pkg, [])
    groups.get(pkg).push(absolute)
  }
  else {
    rootFiles.push(absolute)
  }
}

function run(command, cwd) {
  execSync(command, { cwd, shell: true, stdio: 'inherit' })
}

function eslintFix(files, cwd) {
  const args = files.map(f => JSON.stringify(f)).join(' ')
  run(`pnpm exec eslint --fix ${args}`, cwd)
}

for (const [pkg, pkgFiles] of groups)
  eslintFix(pkgFiles, pkg)

if (rootFiles.length > 0)
  eslintFix(rootFiles)
