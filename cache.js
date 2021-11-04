import { mkdir, readdir, readFile, rm, writeFile } from 'fs/promises'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

// Update when registry structure changes
const VERSION = 2

function getCacheDir() {
  const root = dirname(fileURLToPath(import.meta.url))
  return resolve(root, '.cache')
}

function getCachePath(key) {
  const hash = Buffer.from(VERSION + key).toString('base64')
  return resolve(getCacheDir(), hash)
}

export async function getCacheValue(key) {
  try {
    const src = await readFile(getCachePath(key), 'utf8')
    return JSON.parse(src)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    return null
  }
}

export async function setCacheValue(key, value) {
  try {
    await mkdir(getCacheDir(), { recursive: true })
    await writeFile(getCachePath(key), JSON.stringify(value))
  } catch (error) {
    console.warn(error)
  }
}

export async function clearCache() {
  try {
    const dir = getCacheDir()
    const files = await readdir(dir)
    for (const file of files) await rm(resolve(dir, file))
    return files.length
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}
