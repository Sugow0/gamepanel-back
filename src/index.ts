import { Elysia } from 'elysia'
import { cors }    from '@elysiajs/cors'
import { swagger } from '@elysiajs/swagger'
import { serversRoutes } from './routes/servers'
import { filesRoutes } from './routes/files'
import { startStatusWorker } from './services/status-worker'

const app = new Elysia()
  .use(cors())
  .use(swagger({
    path: '/docs',
    documentation: {
      info: { title: 'GamePanel API', version: '1.0.0' },
      tags: [{ name: 'servers', description: 'Gestion des serveurs de jeux' }],
    },
  }))

  .get('/health', () => ({
    ok: true,
    service: 'gamepanel-api',
    timestamp: new Date().toISOString(),
    dokploy: !!process.env.DOKPLOY_URL,
  }))

  .use(serversRoutes)
  .use(filesRoutes)

  .listen({ port: process.env.PORT ?? 3001, hostname: '0.0.0.0' })

console.log(`🎮 GamePanel API → http://localhost:${app.server?.port}`)
console.log(`📖 Swagger docs  → http://localhost:${app.server?.port}/docs`)
if (!process.env.DOKPLOY_URL) {
  console.warn('⚠️  DOKPLOY_URL non configuré — les déploiements seront simulés')
}

// Lancer le worker qui synchronise les statuts en tâche de fond
startStatusWorker()
