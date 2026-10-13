import { readdir, readFile } from 'node:fs/promises';
import { Script } from 'node:vm';
import { resolve } from 'node:path';
for (const folder of ['js', 'data']) {
  for (const name of await readdir(folder)) if (name.endsWith('.js')) new Script(await readFile(resolve(folder, name), 'utf8'), { filename: folder + '/' + name });
}
new Script(await readFile('sw.js', 'utf8'), { filename: 'sw.js' });
for (const name of ['index.html', 'remote.html']) {
  const text = await readFile(name, 'utf8');
  for (const block of text.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new Script(block[1], { filename: name });
}
for (const name of ['manifest.webmanifest', 'wrangler.jsonc', 'package.json']) JSON.parse(await readFile(name, 'utf8'));
console.log('JavaScript, inline scripts and configuration syntax passed');
