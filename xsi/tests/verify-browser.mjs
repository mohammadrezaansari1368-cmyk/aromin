import { readFile } from 'node:fs/promises';
import { browserChecks } from './browser-checks.mjs';
const evidence = JSON.parse(await readFile(process.argv[2], 'utf8'));
const checks = browserChecks(evidence);
const failed = Object.entries(checks).filter(([, passed]) => !passed);
console.log(JSON.stringify({ passed: Object.keys(checks).length - failed.length, failed: failed.length, failures: failed.map(([name]) => name) }));
process.exitCode = failed.length ? 1 : 0;
