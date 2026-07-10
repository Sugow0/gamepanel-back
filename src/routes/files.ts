import { Elysia, t } from 'elysia'
import { db } from '../db'
import Client from 'ssh2-sftp-client'

const error = (status: number, body: any) => 
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export const filesRoutes = new Elysia({ prefix: '/servers/:id/files' })

  // GET /servers/:id/files?path=/data
  .get('/', async ({ request, params: { id }, query }) => {
    const { rows } = await db.query('SELECT * FROM servers WHERE id = $1', [id])
    const server = rows[0]
    if (!server) return error(404, { message: 'Serveur introuvable' })

    const sftpPort = 2220 + parseInt(server.id.replace(/\D/g, '')) % 1000
    const host = process.env.PUBLIC_IP || request.headers.get('host')?.split(':')[0] || '127.0.0.1'
    const username = `sftp-${server.dokloy_app}`
    const password = server.sftp_password

    const sftp = new Client()
    const targetPath = query.path || '/'

    try {
      await sftp.connect({
        host,
        port: sftpPort,
        username,
        password
      })
      const list = await sftp.list(targetPath)
      await sftp.end()
      return list
    } catch (e: any) {
      return error(500, { message: e.message })
    }
  }, {
    query: t.Object({
      path: t.Optional(t.String())
    })
  })

  // GET /servers/:id/files/content?path=/data/server.properties
  .get('/content', async ({ request, params: { id }, query }) => {
    const { rows } = await db.query('SELECT * FROM servers WHERE id = $1', [id])
    const server = rows[0]
    if (!server) return error(404, { message: 'Serveur introuvable' })

    const sftpPort = 2220 + parseInt(server.id.replace(/\D/g, '')) % 1000
    const host = process.env.PUBLIC_IP || request.headers.get('host')?.split(':')[0] || '127.0.0.1'
    const username = `sftp-${server.dokloy_app}`
    const password = server.sftp_password

    const sftp = new Client()

    try {
      await sftp.connect({ host, port: sftpPort, username, password })
      const buffer = await sftp.get(query.path)
      await sftp.end()
      return { content: (buffer as Buffer).toString('utf-8') }
    } catch (e: any) {
      return error(500, { message: e.message })
    }
  }, {
    query: t.Object({
      path: t.String()
    })
  })

  // PUT /servers/:id/files/content
  .put('/content', async ({ request, params: { id }, body }) => {
    const { rows } = await db.query('SELECT * FROM servers WHERE id = $1', [id])
    const server = rows[0]
    if (!server) return error(404, { message: 'Serveur introuvable' })

    const { path, content } = body as { path: string, content: string }

    const sftpPort = 2220 + parseInt(server.id.replace(/\D/g, '')) % 1000
    const host = process.env.PUBLIC_IP || request.headers.get('host')?.split(':')[0] || '127.0.0.1'
    const username = `sftp-${server.dokloy_app}`
    const password = server.sftp_password

    const sftp = new Client()

    try {
      await sftp.connect({ host, port: sftpPort, username, password })
      await sftp.put(Buffer.from(content, 'utf-8'), path)
      await sftp.end()
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
  .delete('/', async ({ request, params: { id }, query }) => {
    const { rows } = await db.query('SELECT * FROM servers WHERE id = $1', [id])
    const server = rows[0]
    if (!server) return error(404, { message: 'Serveur introuvable' })

    const sftpPort = 2220 + parseInt(server.id.replace(/\D/g, '')) % 1000
    const host = process.env.PUBLIC_IP || request.headers.get('host')?.split(':')[0] || '127.0.0.1'
    const username = `sftp-${server.dokloy_app}`
    const password = server.sftp_password

    const sftp = new Client()

    try {
      await sftp.connect({ host, port: sftpPort, username, password })
      const stat = await sftp.stat(query.path)
      if (stat.isDirectory) {
        await sftp.rmdir(query.path, true)
      } else {
        await sftp.delete(query.path)
      }
      await sftp.end()
      return { ok: true }
    } catch (e: any) {
      return error(500, { message: e.message })
    }
  }, {
    query: t.Object({
      path: t.String()
    })
  })
