import { access, readdir, readFile } from 'fs/promises'
import { basename, dirname, relative, resolve } from 'path'

import { getCacheValue, setCacheValue } from './cache.js'
export { clearCache } from './cache.js'

/**
 * @param {string} root
 * @param {string} uri
 */
export async function resolveChromeUri(root, uri) {
  const reg = await getRegistry(root)
  const found = new Set() // Set(path)

  if (uri.startsWith('chrome://')) {
    const [pkgName, section, ...pathParts] = uri
      .substring('chrome://'.length)
      .split('/')

    switch (section) {
      case 'locale': {
        const rp = reg.locale[pkgName]
        if (!rp) throw new Error(`Unknown package ${pkgName}`)
        for (const { dir, uri } of rp) {
          const lcRoot = resolve(root, dir, 'en-US')

          // This is hacky, but mostly works
          const fixUri = uri.replace(/^%locale\/(@AB_CD@\/)?/, '')
          for (const id of ['', ...(await subDirectories(lcRoot))]) {
            let path = resolve(lcRoot, id, fixUri, ...pathParts)
            if (await exists(path)) found.add(path)
            else {
              // Did I mention hackyness?
              path = resolve(lcRoot, id, ...pathParts)
              if (await exists(path)) found.add(path)
            }
          }
        }
        break
      }

      case 'content': {
        const rp = reg.content[pkgName]
        if (!rp) throw new Error(`Unknown package ${pkgName}`)
        for (const { dir, uri } of rp) {
          let path = resolve(
            root,
            dir,
            uri === '%content/' ? '' : 'content',
            ...pathParts
          )
          if (await exists(path)) found.add(path)
          else {
            // This is sane, I'm sure.
            const ps = new Set(relative(root, path).split('/'))
            path = resolve(root, ...ps)
            if (await exists(path)) found.add(path)
          }
        }
        break
      }
    }
  } else if (uri.startsWith('resource://')) {
    // Let's not, yet
    const [alias, ...path] = uri.substring('resource://'.length).split('/')
    return reg.resource[alias]
  } else {
    return reg[uri] || reg
  }

  if (found.size === 0) {
    if (uri.endsWith('.properties')) {
      const end = '/' + basename(uri)
      for (const path of reg.paths.properties)
        if (path.endsWith(end)) found.add(path)
    } else if (uri.endsWith('.xhtml')) {
      const end = '/' + basename(uri)
      for (const path of reg.paths.xhtml)
        if (path.endsWith(end)) found.add(path)
    }
  }

  return found
}

/*
 * # content
 *
 * A content package is registered with the line:
 *
 *     content packagename uri/to/files/ [flags]
 *
 * This will register a location to use when resolving the URI `chrome://packagename/content/…`.
 * The URI may be absolute or relative to the location of the manifest file. Note: it must end with a ‘/’.
 *
 * # locale
 *
 * A locale package is registered with the line:
 *
 *     locale packagename localename uri/to/files/ [flags]
 *
 * This will register a locale package when resolving the URI `chrome://packagename/locale/…`.
 * The localename is usually a plain language identifier “en” or a language-country identifier “en-US”.
 * If more than one locale is registered for a package, the chrome registry will select the best-fit locale using the user’s preferences.
 *
 * # resource
 *
 * Aliases can be created using the resource instruction:
 *
 *     resource aliasname uri/to/files/ [flags]
 *
 * This will create a mapping for `resource://<aliasname>/` URIs to the path given.
 */

async function getRegistry(root) {
  const cached = await getCacheValue(root)
  if (cached) return cached

  const paths = await getFilePaths(root)
  const registry = { content: {}, locale: {}, resource: {}, paths }
  for (const jarPath of paths.jar) {
    let dir = relative(root, dirname(jarPath))
    const src = await readFile(jarPath, 'utf8')
    for (const line of src.matchAll(
      /^%\s+(content|locale|resource)\s+(.*)|^relativesrcdir\s+(.+):/gm
    )) {
      if (line[3]) {
        dir = line[3].trim()
        continue
      }
      const [pkgName, ...parts] = line[2].split(/\s+/)
      if (line[1] === 'locale') {
        const lc = parts.shift()
        if (lc !== '@AB_CD@' && lc !== 'en-US')
          throw new Error(`Unexpected locale ${lc} in ${jarPath}`)
      }
      const [uri, ...flags] = parts
      const entry = flags.length > 0 ? { dir, uri, flags } : { dir, uri }
      const reg = registry[line[1]]
      if (!reg[pkgName]) reg[pkgName] = [entry]
      else reg[pkgName].push(entry)
    }
  }

  await setCacheValue(root, registry)
  return registry
}

/** @param {string} root */
async function getFilePaths(root) {
  /** @type {{ jar: string[], properties: string[], xhtml: string[] }} */
  const paths = { jar: [], properties: [], xhtml: [] }
  for (const ent of await readdir(root, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      if (
        ent.name === 'test' ||
        ent.name === 'tests' ||
        ent.name.startsWith('obj-')
      )
        continue
      const fp = await getFilePaths(resolve(root, ent.name))
      for (const key of Object.keys(paths))
        if (fp[key].length > 0) Array.prototype.push.apply(paths[key], fp[key])
    } else if (ent.name === 'jar.mn') paths.jar.push(resolve(root, ent.name))
    else if (ent.name.endsWith('.properties'))
      paths.properties.push(resolve(root, ent.name))
    else if (ent.name.endsWith('.xhtml'))
      paths.xhtml.push(resolve(root, ent.name))
  }
  return paths
}

const _subDirCache = new Map()
/** @param {string} root */
async function subDirectories(root) {
  let dirs = _subDirCache.get(root)
  if (!dirs) {
    dirs = []
    try {
      for (const ent of await readdir(root, { withFileTypes: true }))
        if (ent.isDirectory()) dirs.push(ent.name)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    _subDirCache.set(root, dirs)
  }
  return dirs
}

async function exists(path) {
  try {
    await access(path)
    return true
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    return false
  }
}
