import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const checks = [
  ['node', ['--version']],
  ['npm', ['--version']],
  ['psql', ['--version']],
  ['nginx', ['-v']],
];
let failed = false;
for (const [bin, args] of checks) {
  try {
    const out = execFileSync(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
    console.log('GREEN', bin, (out || '').trim());
  } catch (error) {
    failed = true;
    console.error('RED', bin, error?.stderr?.toString?.().trim() || error?.message || 'not available');
  }
}
for (const file of [
  'deploy/native/testagram-identity-api.service',
  'deploy/native/testagram-identity-engine.service',
  'deploy/native/testagram-identity-nginx.conf',
  'deploy/native/backend.env.example',
  'deploy/native/engine.env.example',
]) {
  if (existsSync(file)) console.log('GREEN file', file);
  else { failed = true; console.error('RED file', file); }
}
process.exit(failed ? 1 : 0);
