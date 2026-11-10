// Builds the Windows installer and publishes it as a GitHub release.
// Every installed copy of Modelart Tracker checks these releases and updates itself.
//
// Usage:  npm run release -- patch      (0.1.0 -> 0.1.1, the usual)
//         npm run release -- minor      (0.1.0 -> 0.2.0)
//         npm run release -- patch "What changed, in one line"
import { execSync } from 'node:child_process'
import fs from 'node:fs'

const run = (cmd) => execSync(cmd, { stdio: 'inherit' })
const [bump, notes] = process.argv.slice(2)

if (execSync('git status --porcelain').toString().trim()) {
  console.error('Commit your changes first, so the release matches the code on GitHub.')
  process.exit(1)
}
if (!bump) {
  console.error('Say which part of the version to bump: npm run release -- patch')
  process.exit(1)
}
run('npm test')
run(`npm version ${bump} -m "Release %s"`)
const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const repo = JSON.parse(fs.readFileSync('package.json', 'utf8')).build.publish[0]

// Clean build, so the installer and the update manifest (latest.yml) always match.
fs.rmSync('dist', { recursive: true, force: true })
run('npx electron-vite build')
run('npx electron-builder --win --publish never')

const exe = `dist/Modelart-Tracker-Setup-${version}.exe`
run('git push --follow-tags')
run(
  `gh release create v${version} "${exe}" "${exe}.blockmap" dist/latest.yml -R ${repo.owner}/${repo.repo} ` +
    `--title "v${version}" --notes "${(notes ?? 'Updates and fixes.').replace(/"/g, "'")}"`
)
console.log(`\nPublished v${version}. Installed copies pick it up when they start, or within 4 hours.`)
