import { Elysia, t } from 'elysia'
import { db } from '../db'
import Client from 'ssh2-sftp-client'
import { Socket } from 'net'

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

async function connectSftp(sftp: Client, server: any) {
  return new Promise<void>((resolve, reject) => {
    const sock = new Socket()
    sock.on('error', reject)
    sock.on('close', () => reject(new Error('Socket closed before connection')))
    
    sock.connect({ host: getSftpHost(server), port: 22 }, async () => {
      // Retirer les listeners temporaires pour laisser ssh2-sftp-client gérer
      sock.removeAllListeners('error')
      sock.removeAllListeners('close')
      
      try {
        await (sftp.connect as any)({ sock, username: `sftp-${server.dokloy_app}`, password: server.sftp_password })
        resolve()
      } catch (err) {
        reject(err)
      }
    })
  })
}

export const filesRoutes = new Elysia({ prefix: '/servers/:id/files' })

  // GET /servers/:id/files?path=/data
  .get('/', async ({ params: { id }, query }) => {
    const { rows } = await db.query('SELECT * FROM servers WHERE id = $1', [id])
    const server = rows[0]
    if (!server) return error(404, { message: 'Serveur introuvable' })

    if (IS_MOCK) return MOCK_FILES

    const sftp = new Client()
    const targetPath = query.path || '/'
    try {
      await connectSftp(sftp, server)
      const list = await sftp.list(targetPath)
      return list
    } catch (e: any) {
      return error(500, { message: e.message })
    } finally {
      sftp.end()
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

    const sftp = new Client()
    try {
      await connectSftp(sftp, server)
      const buffer = await sftp.get(query.path)
      return { content: (buffer as Buffer).toString('utf-8') }
    } catch (e: any) {
      return error(500, { message: e.message })
    } finally {
      sftp.end()
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

    const sftp = new Client()
    try {
      await connectSftp(sftp, server)
      await sftp.put(Buffer.from(content, 'utf-8'), path)
      return { ok: true }
    } catch (e: any) {
      return error(500, { message: e.message })
    } finally {
      sftp.end()
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

    const sftp = new Client()
    try {
      await connectSftp(sftp, server)
      const stat = await sftp.stat(query.path)
      if (stat.isDirectory) {
        await sftp.rmdir(query.path, true)
      } else {
        await sftp.delete(query.path)
      }
      return { ok: true }
    } catch (e: any) {
      return error(500, { message: e.message })
    } finally {
      sftp.end()
    }
  }, {
    query: t.Object({
      path: t.String()
    })
  })
