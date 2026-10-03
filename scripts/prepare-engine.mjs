import { copyFile, mkdir, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const source = join(root, 'node_modules', 'stockfish')
const destination = join(root, 'public', 'engine')
const files = await readdir(join(source, 'src'))
const engineFiles = files.filter((file) => /^stockfish-17\.1-lite-single.*\.(js|wasm)$/.test(file))

if (!engineFiles.some((file) => file.endsWith('.js')) || !engineFiles.some((file) => file.endsWith('.wasm'))) {
  throw new Error('The Stockfish 17.1 single-threaded lite distribution is missing. Run npm install again.')
}

await mkdir(destination, { recursive: true })
await Promise.all(engineFiles.map((file) => copyFile(join(source, 'src', file), join(destination, file))))
await copyFile(join(source, 'Copying.txt'), join(destination, 'COPYING.txt'))
console.log(`Prepared local Stockfish engine (${engineFiles.length} files).`)
