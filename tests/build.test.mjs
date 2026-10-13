import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Script } from 'node:vm';
import { build, output } from '../scripts/build.mjs';

test('deployment contains only public assets and a complete offline manifest', async () => {
  const metadata = await build();
  const rootFiles = await readdir(output);
  for (const privateFile of ['.git', '.github', 'node_modules', 'README.md', 'PLAN.md', 'khonshu_server.py', 'package.json', '.env']) assert(!rootFiles.includes(privateFile));
  const sw = await readFile(join(output, 'sw.js'), 'utf8');
  assert(sw.includes(metadata.revision));
  const list = JSON.parse(sw.match(/const ASSETS = (\[[^;]+\]);/)[1]);
  assert(list.length > 10);
  for (const name of list) await readFile(join(output, name));
  const manifest = JSON.parse(await readFile(join(output, 'manifest.webmanifest')));
  for (const icon of manifest.icons) {
    const bytes = await readFile(join(output, icon.src));
    assert.equal(bytes.readUInt32BE(16), +icon.sizes.split('x')[0]);
  }
  for (const html of ['index.html', 'remote.html']) {
    const source = await readFile(join(output, html), 'utf8');
    for (const ref of source.matchAll(/(?:src|href)="([^"#]+)"/g)) if (!ref[1].includes(':')) await readFile(join(output, ref[1]));
  }
  new Script(sw);
});

test('Cloudflare Builds identifies the published commit without a local dirty suffix', async () => {
  const oldWorkers = process.env.WORKERS_CI_COMMIT_SHA, oldGitHub = process.env.GITHUB_SHA;
  try {
    delete process.env.GITHUB_SHA;
    process.env.WORKERS_CI_COMMIT_SHA = '0123456789abcdef0123456789abcdef01234567';
    const metadata = await build();
    assert.equal(metadata.commit, '0123456');
    assert((await readFile(join(output, 'js/version.js'), 'utf8')).includes('"commit":"0123456"'));
  } finally {
    if (oldWorkers === undefined) delete process.env.WORKERS_CI_COMMIT_SHA; else process.env.WORKERS_CI_COMMIT_SHA = oldWorkers;
    if (oldGitHub === undefined) delete process.env.GITHUB_SHA; else process.env.GITHUB_SHA = oldGitHub;
    await build();
  }
});
