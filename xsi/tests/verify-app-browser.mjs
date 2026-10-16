import { readFile } from 'node:fs/promises';
import { appBrowserChecks } from './app-browser-checks.mjs';
const data=JSON.parse(await readFile(process.argv[2],'utf8'));
const checks=appBrowserChecks(data.normalized_result||data);
const failures=Object.keys(checks).filter(name=>!checks[name]);
console.log(JSON.stringify({passed:Object.keys(checks).length-failures.length,failed:failures.length,failures}));process.exitCode=failures.length?1:0;
