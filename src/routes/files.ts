import { Elysia, t } from 'elysia'
import { db } from '../db'
import { exec } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'

const execAsync = promisify(exec)

const IS_MOCK = !process.env.DOKPLOY_URL

const error = (status: number, body: any) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const MOCK_FILES = [
  { type: 'd', name: 'world',  size: 0,    modifyTime: Date.now(), accessTime: Date.now(), rights: { user: 'rwx', group: 'r-x', other: 'r-x' }, owner: 1000, group: 1000 },
  { type: '-', name: 'server.properties', size: 1024, modifyTime: Date.now(), accessTime: Date.now(), rights: { user: 'rw-', group: 'r--', other: 'r--' }, owner: 1000, group: 1000 },
  { type: '-', name: 'eula.txt', size: 45, modifyTime: Date.now(), accessTime: Date.now(), rights: { user: 'rw-', group: 'r--', other: 'r--' }, owner: 1000, group: 1000 },
  { type: 'd', name: 'logs',   size: 0,    modifyTime: Date.now(), accessTime: Date.now(), rights: { user: 'rwx', group: 'r-x', other: 'r-x' }, owner: 1000, group: 1000 },
]

const MOCK_CONTENT: Record<string, string> = {
  'server.properties': `#Minecraft server properties\nonline-mode=true\nmax-players=20\ndifficulty=normal\n`,
  'eula.txt': `#By changing the setting below to TRUE you are indicating your agreement to our EULA\neula=true\n`,
}

function getSftpHost(server: any) {
  return process.env.NODE_ENV === 'development' ? '127.0.0.1' : `sftp-${server.dokloy_app}`
}

function getSftpPort(server: any) {
  return process.env.NODE_ENV === 'development' 
    ? 2220 + parseInt(server.id.replace(/\D/g, '')) % 1000 
    : 22
}

async function runSftpWorker(action: string, server: any, targetPath: string, content: string = '') {
  const host = getSftpHost(server)
  const port = getSftpPort(server)
  const username = `sftp-${server.dokloy_app}`
  const workerPath = join(__dirname, '../sftp-worker.js')
  
  // Utiliser des arguments sûrs pour la ligne de commande
  const args = [action, host, port, username, server.sftp_password, targetPath, content]
  const escapedArgs = args.map(a => `'${String(a).replace(/'/g, "'\\''")}'`).join(' ')
  
  try {
    const { stdout } = await execAsync(`node ${workerPath} ${escapedArgs}`)
    const res = JSON.parse(stdout.trim())
    if (!res.success) throw new Error(res.error)
    return res.data
  } catch (err: any) {
    console.error(`[SFTP Worker Error]`, err)
    throw new Error(err.message || 'Worker execution failed')
  }
}

export const filesRoutes = new Elysia({ prefix: '/servers/:id/files' })

  // GET /servers/:id/files?path=/data
  .get('/', async ({ params: { id }, query }) => {
    const { rows } = await db.query('SELECT * FROM servers WHERE id = $1', [id])
    const server = rows[0]
    if (!server) return error(404, { message: 'Serveur introuvable' })

    if (IS_MOCK) return MOCK_FILES

    const targetPath = query.path || '/'
    try {
      return await runSftpWorker('list', server, targetPath)
    } catch (e: any) {
      return error(500, { message: e.message })
    }
  }, {
    query: t.Object({
      path: t.Optional(t.String())
    })
  })

  // GET /servers/:id/files/content?path=/data/server.properties
  .get('/content', async ({ params: { id }, query }) => {
    const { rows } = await db.query('SELECT * FROM servers WHERE id = $1', [id])
    const server = rows[0]
    if (!server) return error(404, { message: 'Serveur introuvable' })

    if (IS_MOCK) {
      const fileName = query.path.split('/').pop() ?? ''
      return { content: MOCK_CONTENT[fileName] ?? `# mock content for ${query.path}\n` }
    }

    try {
      const content = await runSftpWorker('get', server, query.path)
      return { content }
    } catch (e: any) {
      return error(500, { message: e.message })
    }
  }, {
    query: t.Object({
      path: t.String()
    })
  })

  // PUT /servers/:id/files/content
  .put('/content', async ({ params: { id }, body }) => {
    const { rows } = await db.query('SELECT * FROM servers WHERE id = $1', [id])
    const server = rows[0]
    if (!server) return error(404, { message: 'Serveur introuvable' })

    const { path, content } = body as { path: string, content: string }

    if (IS_MOCK) return { ok: true }

    try {
      await runSftpWorker('put', server, path, content)
      return { ok: true }
    } catch (e: any) {
      return error(500, { message: e.message })
    }
  }, {
    body: t.Object({
      path: t.String(),
      content: t.String()
    })
  })

  // DELETE /servers/:id/files?path=/data/mods/old.jar
  .delete('/', async ({ params: { id }, query }) => {
    const { rows } = await db.query('SELECT * FROM servers WHERE id = $1', [id])
    const server = rows[0]
    if (!server) return error(404, { message: 'Serveur introuvable' })

    if (IS_MOCK) return { ok: true }

    try {
      await runSftpWorker('delete', server, query.path)
      return { ok: true }
    } catch (e: any) {
      return error(500, { message: e.message })
    }
  }, {
    query: t.Object({
      path: t.String()
    })
  })
