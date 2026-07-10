import type { GameServer } from '../types/server'

const DOKPLOY_URL = process.env.DOKPLOY_URL ?? ''
const DOKPLOY_KEY = process.env.DOKPLOY_API_KEY ?? ''
const PROJECT_NAME = 'Serveur Jeux'

// ── API client ─────────────────────────────────────────────────────────────

const api = async (path: string, body?: unknown, method = body ? 'POST' : 'GET') => {
  if (!DOKPLOY_URL || !DOKPLOY_KEY) {
    console.warn('[Dokploy] DOKPLOY_URL/DOKPLOY_API_KEY non configurés — mode mock')
    return { projectId: 'mock', composeId: `compose-${Date.now()}` }
  }
  const res = await fetch(`${DOKPLOY_URL}/api/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-api-key': DOKPLOY_KEY },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`Dokploy ${path}: ${res.status} ${await res.text()}`)
  return res.json()
}

// ── Project ────────────────────────────────────────────────────────────────

let _environmentId: string | null = null

export async function getOrCreateEnvironment(): Promise<string> {
  if (_environmentId) return _environmentId
  
  // 1. Get or create Project
  let projectId: string
  const projects = await api('project.all') as any[]
  let project = projects.find(p => p.name === PROJECT_NAME)
  
  if (!project) {
    project = await api('project.create', { name: PROJECT_NAME, description: 'Serveurs de jeux — GamePanel' })
    projectId = project.projectId
  } else {
    projectId = project.projectId
  }

  // 2. Get or create Environment
  let envId: string
  if (project.environments && project.environments.length > 0) {
    envId = project.environments[0].environmentId
  } else {
    // If environments are not populated in project.all, we might need to fetch them
    const envs = await api('project.byProjectId', { projectId })
      .then((res: any) => res.environments)
      .catch(() => [])
    
    if (envs && envs.length > 0) {
      envId = envs[0].environmentId
    } else {
      const newEnv = await api('environment.create', { projectId, name: 'Production' })
      envId = newEnv.environmentId
    }
  }

  _environmentId = envId
  return envId
}

// ── Compose builders ───────────────────────────────────────────────────────

function buildMinecraftCompose(s: GameServer): string {
  const sftpPort = 2220 + parseInt(s.id.replace(/\D/g, '')) % 1000
  const env: Record<string, string> = {
    EULA: 'TRUE',
    TYPE: s.mc_type ?? 'PAPER',
    VERSION: s.version ?? 'LATEST',
    MEMORY: s.memory,
    MAX_PLAYERS: String(s.max_players),
    DIFFICULTY: s.difficulty ?? 'normal',
    MODE: s.gamemode ?? 'survival',
    MOTD: s.motd ?? 'GamePanel Server',
    PVP: String(s.pvp ?? true),
    ONLINE_MODE: String(s.online_mode ?? true),
    WHITELIST: String(s.whitelist ?? false),
    VIEW_DISTANCE: String(s.view_distance ?? 10),
    ENABLE_COMMAND_BLOCK: String(s.enable_command_block ?? false),
    ALLOW_FLIGHT: String(s.allow_flight ?? false),
    SPAWN_PROTECTION: String(s.spawn_protection ?? 16),
    ...(s.seed ? { SEED: s.seed } : {}),
    ...(s.extra_env_vars ?? {}),
  }
  const envBlock = Object.entries(env).map(([k, v]) => `      ${k}: "${v}"`).join('\n')

  return `version: "3.8"
services:
  ${s.dokloy_app}:
    image: itzg/minecraft-server
    restart: unless-stopped
    tty: true
    stdin_open: true
    environment:
${envBlock}
    ports:
      - "${s.port}:25565"
      - "${s.port + 1}:25575"
    volumes:
      - ${s.id}-data:/data
    healthcheck:
      test: ["CMD", "mc-monitor", "status", "--host", "localhost"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 120s

  sftp-${s.dokloy_app}:
    image: atmoz/sftp:latest
    restart: unless-stopped
    command: "sftp-${s.dokloy_app}:${s.sftp_password}:1001"
    ports:
      - "${sftpPort}:22"
    volumes:
      - ${s.id}-data:/home/sftp-${s.dokloy_app}/data
    depends_on:
      - ${s.dokloy_app}

volumes:
  ${s.id}-data:
`
}

function buildLinuxGSMCompose(s: GameServer): string {
  const sftpPort = 2220 + parseInt(s.id.replace(/\D/g, '')) % 1000
  const tag = s.lgsm_tag ?? s.lgsm_id?.replace(/server$/, '') ?? s.game

  return `version: "3.8"
services:
  ${s.dokloy_app}:
    image: ghcr.io/gameservermanagers/gameserver:${tag}
    container_name: ${s.lgsm_id ?? s.dokloy_app}
    restart: unless-stopped
    # network_mode: host  # décommenter si problèmes réseau (CS2, ARK, Rust…)
    environment:
      - GAMESERVER=${s.lgsm_id ?? s.dokloy_app}
    ports:
      - "${s.port}:${s.port}"
    volumes:
      - ${s.id}-data:/data
    deploy:
      resources:
        limits:
          memory: ${s.memory}

  sftp-${s.dokloy_app}:
    image: atmoz/sftp:latest
    restart: unless-stopped
    command: "sftp-${s.dokloy_app}:${s.sftp_password}:1001"
    ports:
      - "${sftpPort}:22"
    volumes:
      - ${s.id}-data:/home/sftp-${s.dokloy_app}/data
    depends_on:
      - ${s.dokloy_app}

volumes:
  ${s.id}-data:
`
}

export function buildCompose(s: GameServer): string {
  return s.game === 'minecraft' ? buildMinecraftCompose(s) : buildLinuxGSMCompose(s)
}

// ── Application CRUD ───────────────────────────────────────────────────────

export async function createApplication(server: GameServer) {
  const environmentId = await getOrCreateEnvironment()
  const compose       = buildCompose(server)
  const app           = await api('compose.create', {
    environmentId,
    name: server.dokloy_app,
    description: `${server.name} — GamePanel`,
    composeType: 'docker-compose',
  })
  await api('compose.update', { composeId: app.composeId, dockerCompose: compose })
  await api('compose.deploy', { composeId: app.composeId })
  return { composeId: app.composeId, compose }
}

export const deployApp = (id: string) => api('compose.deploy', { composeId: id })
export const stopApp   = (id: string) => api('compose.stop',   { composeId: id })

export async function deleteApp(id: string) {
  await stopApp(id).catch(() => {})
  return api('compose.delete', { composeId: id })
}

export async function getAppLogs(composeId: string, lines = 200): Promise<string[]> {
  const result = await api('compose.fetchLogs', { composeId, lines })
  return ((result?.data as string) ?? '').split('\n').filter(Boolean)
}
