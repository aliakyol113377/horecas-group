import fs from 'node:fs'
import path from 'node:path'
import { parseProductHtml } from '../parse.util.mjs'

const html = fs.readFileSync(path.join(process.cwd(), 'prisma/import/tests/sample.html'), 'utf8')
const parsed = parseProductHtml('https://complex-bar.kz/catalog/stolovaya-posuda/tarelka-18', html)
console.log(JSON.stringify(parsed, null, 2))
