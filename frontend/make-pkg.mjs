import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
execFileSync('python3', [fileURLToPath(new URL('../tools/package_release.py', import.meta.url))], { stdio: 'inherit' })
