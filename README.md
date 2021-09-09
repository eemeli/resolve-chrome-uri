# resolve-chrome-uri

A really hacky utility for resolving `chrome://` URIs into file paths under mozilla-central.
Internally, parses `%` lines from `jar.mn` files and then looks around.
Results are cached to disk, as this is a bit slow.
Supports only `content` and `locale` URIs.

To use as a library:

```js
import { clearCache, resolveChromeUri } from 'resolve-chrome-uri'

const root = 'path/to/mozilla-central'
const uri = 'chrome://mozapps/content/update/history.xhtml'
const res = await resolveChromeUri(root, uri)

> Set(1) {
    '/absolute/path/to/mozilla-central/toolkit/mozapps/update/content/history.xhtml'
  }
```

Provides a CLI which uses the current directory as the root and takes the URI
as a single argument:

```sh
$ npx resolve-chrome-uri chrome://mozapps/content/update/history.xhtml
toolkit/mozapps/update/content/history.xhtml
```

To clear the cache, use `-c` or `--clear` as the argument.
