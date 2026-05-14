import { readFileSync, writeFileSync } from 'node:fs'

const rootPkg = JSON.parse(readFileSync('package.json', 'utf-8'))
const newVersion = rootPkg.version

const packages = [
  'packages/blendtype/package.json',
  'packages/nuxt-galaxy/package.json',
  'packages/ui/package.json',
  'packages/wiki/package.json',
]

for (const pkgPath of packages) {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  pkg.version = newVersion
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
}
