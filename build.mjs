#!/usr/bin/env node
// Builds _site/ (GitHub Pages) from this repository's releases:
//   index.html     changelog from template.html, with the DMG links of each release
//   releases.json  the same data, machine-readable (e.g. for an in-app update check)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = process.env.GITHUB_REPOSITORY || 'checcoux/screentime-releases';
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '_site');

const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100`, { headers });
if (!res.ok) throw new Error(`GitHub releases: ${res.status} ${await res.text()}`);

const releases = (await res.json()).filter((r) => !r.draft).map((r) => ({
    version: r.tag_name.replace(/^v/, ''),
    tag: r.tag_name,
    date: r.published_at,
    prerelease: r.prerelease,
    notes: (r.body ?? '').split('\n').map((l) => l.trim().replace(/^[*-]\s+/, '')).filter((l) => l && !l.startsWith('#') && !l.startsWith('**Full Changelog**')),
    downloads: r.assets.filter((a) => a.name.endsWith('.dmg')).map((a) => ({
        name: a.name,
        url: a.browser_download_url,
        size: a.size,
        sha256: a.digest?.replace(/^sha256:/, '') ?? null,
    })),
}));

const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const date = (iso) => new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Rome' });
const html = releases.map((r) => `
    <div>
        <p class="nomb">[${escape(r.tag)}] - ${date(r.date)}${r.prerelease ? ' (pre-release)' : ''}</p>
        <p class="ml">
${r.notes.map((n) => `            * ${escape(n)} <br>`).join('\n')}
${r.downloads.map((d) => `            <br>\n            <a href="${escape(d.url)}">[download macOS]</a>`).join('\n')}
        </p>
        <br>
    </div>`).join('\n');

await mkdir(OUT, { recursive: true });
const template = await readFile(join(HERE, 'template.html'), 'utf8');
await writeFile(join(OUT, 'index.html'), template.replace('{{releases}}', html));
await writeFile(join(OUT, 'releases.json'), JSON.stringify({ latest: releases.find((r) => !r.prerelease) ?? null, releases }, null, 2) + '\n');
console.log(`✓ _site: ${releases.length} release(s)`);
