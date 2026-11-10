// Builds the Windows installer and publishes it as a GitHub release.
// Every installed copy of Modelart Tracker checks these releases and updates itself.
//
// Usage:  npm run release -- patch      (0.1.0 -> 0.1.1, the usual)
//         npm run release -- minor      (0.1.0 -> 0.2.0)
//         npm run release               (publish the current version as is)
import { execSync } from 'node:child_process'
import fs from 'node:fs'

const run = (cmd, env = {}) => execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } })
const bump = process.argv[2]

if (execSync('git status --porcelain').toString().trim()) {
  console.error('Commit your changes first, so the release matches the code on GitHub.')
  process.exit(1)
}
if (bump) run(`npm version ${bump} -m "Release %s"`)
const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const token = execSync('gh auth token').toString().trim()

run('npm test')
run('npx electron-vite build')
run('npx electron-builder --win --publish always', { GH_TOKEN: token })
run('git push --follow-tags')
console.log(`\nPublished v${version}. Installed copies will pick it up next time they start (or within 4 hours).`)
