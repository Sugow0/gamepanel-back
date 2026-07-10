import { Pool } from 'pg'
import { readFileSync } from 'fs'
import { join } from 'path'

const db = new Pool({ connectionString: process.env.DATABASE_URL })
const sql = readFileSync(join(import.meta.dir, 'schema.sql'), 'utf8')

console.log('🗄️  Running migration…')
await db.query(sql)
console.log('✅ Migration done')
await db.end()
