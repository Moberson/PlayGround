import { createRequire } from 'node:module'
import { mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const runtime = join(process.env.HOME, '.local/share/omgithub-playwright')
const require = createRequire(join(runtime, 'package.json'))
const { chromium } = require('playwright')
const browserConfig = JSON.parse(readFileSync(join(runtime, process.platform === 'darwin' ? 'metal.json' : 'linux.json'), 'utf8'))
if (process.platform === 'linux') process.env.DISPLAY ||= ':' + readFileSync(join(runtime, 'display'), 'utf8').trim()

const url = process.env.CAPTURE_URL
const output = resolve(process.env.CAPTURE_DIR)
if (!url || !output) throw new Error('Set CAPTURE_URL and CAPTURE_DIR.')
mkdirSync(output, { recursive: true })
const temporary = error => Object.assign(error, { exitCode: 75 })
let browser
let exitCode = 0
try {
  browser = await chromium.launch({ ...browserConfig.browser.launchOptions, timeout: 30000 }).catch(error => { throw temporary(error) })
  for (const [name, width, height] of [['desktop', 1280, 800], ['mobile', 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 }).catch(error => { throw temporary(error) })
    const pageErrors = []
    page.on('pageerror', error => pageErrors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') console.error(`[${name}] ${message.text()}`) })
    let response
    try {
      response = await page.goto(url, { waitUntil: 'load', timeout: 45000 })
    } catch (error) {
      await page.close().catch(() => {})
      throw temporary(error)
    }
    if (!response?.ok()) {
      const status = response?.status()
      await page.close().catch(() => {})
      throw Object.assign(new Error(`Preview navigation returned HTTP ${status ?? 'no response'}`), {
        exitCode: !status || [408, 429, 500, 502, 503, 504].includes(status) ? 75 : 1,
      })
    }
    try {
      await page.locator('#game canvas').waitFor({ state: 'visible', timeout: 30000 })
      await page.waitForFunction(() => {
        const canvas = document.querySelector('#game canvas')
        if (!canvas || canvas.width < 100 || canvas.height < 100) return false
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
        return Boolean(gl && document.title.includes('LAST LIGHT'))
      }, { timeout: 30000 })
    } catch (error) {
      await page.close().catch(() => {})
      throw Object.assign(new Error(`Game did not render for ${name}: ${error.message}`), { exitCode: 1 })
    }
    await page.waitForTimeout(1200)
    if (pageErrors.length) {
      await page.close().catch(() => {})
      throw new Error(`JavaScript error in ${name} view: ${pageErrors.join('; ')}`)
    }
    await page.screenshot({ path: join(output, `final-${name}.png`), timeout: 30000 }).catch(error => {
      throw Object.assign(error, { exitCode: error.name === 'TimeoutError' || !browser.isConnected() ? 75 : 1 })
    })
    console.log(`Captured ${name} (${width}x${height}) at ${url}`)
    await page.close()
  }
} catch (error) {
  console.error(error)
  exitCode = error.exitCode || 1
} finally {
  await browser?.close().catch(error => {
    console.error(error)
    exitCode ||= 75
  })
}
process.exitCode = exitCode
