# blendtype

Blendtype is a TypeScript client library for interacting with the [Galaxy](https://galaxyproject.org/) REST API. It provides strongly-typed functions and models for running workflows on Galaxy server.

## Features

- Type-safe API
- Effect-based API for composable and robust workflows
- Handles authentication and error management

## Usage

Install package:

<!-- automd:pm-install -->

```sh
# ✨ Auto-detect
npx nypm install packageName

# npm
npm install packageName

# yarn
yarn add packageName

# pnpm
pnpm install packageName

# bun
bun install packageName

# deno
deno install packageName
```

<!-- /automd -->

Import:

<!-- automd:jsimport cjs cdn name="pkg" -->

**ESM** (Node.js, Bun, Deno)

```js
import { GalaxyClient } from 'blendtype'
```

**CommonJS** (Legacy Node.js)

```js
const { GalaxyClient } = require('blendtype')
```

**CDN** (Deno, Bun and Browsers)

```js
import {} from 'https://esm.sh/pkg'
```

<!-- /automd -->

## Development

<details>

<summary>local development</summary>

- Clone this repository
- Install latest LTS version of [Node.js](https://nodejs.org/en/)
- Enable [Corepack](https://github.com/nodejs/corepack) using `corepack enable`
- Install dependencies using `pnpm install`
- Run interactive tests using `pnpm dev`

</details>

## License

<!-- automd:contributors license=MIT -->

Published under the [MIT](https://github.com/unjs/packageName/blob/main/LICENSE) license.
Made by [community](https://github.com/unjs/packageName/graphs/contributors) 💛
<br><br>
<a href="https://github.com/unjs/packageName/graphs/contributors">
<img src="https://contrib.rocks/image?repo=unjs/packageName" />
</a>

<!-- /automd -->

<!-- automd:with-automd -->

---

_🤖 auto updated with [automd](https://automd.unjs.io)_

<!-- /automd -->
