import { Elysia, t } from 'elysia'
import { db } from '../db'
import { createApplication, deployApp, stopApp, deleteApp, getAppLogs, updateApplication, getAppStatus, wipeServerMap } from '../services/dokploy'

// ── Catalog (reproduit côté backend pour validation) ───────────────────────
const GAME_CATALOG: Record<string, { lgsmId: string | null; lgsmTag: string | null; image: string }> = {
  minecraft: { lgsmId: null,            lgsmTag: null,       image: 'itzg/minecraft-server' },
  cs2:       { lgsmId: 'cs2server',     lgsmTag: 'cs2',      image: 'ghcr.io/gameservermanagers/gameserver:cs2' },
  tf2:       { lgsmId: 'tf2server',     lgsmTag: 'tf2',      image: 'ghcr.io/gameservermanagers/gameserver:tf2' },
  ins:       { lgsmId: 'insserver',     lgsmTag: 'ins',      image: 'ghcr.io/gameservermanagers/gameserver:ins' },
  squad:     { lgsmId: 'squadserver',   lgsmTag: 'squad',    image: 'ghcr.io/gameservermanagers/gameserver:squad' },
  mh:        { lgsmId: 'mordhauserver', lgsmTag: 'mh',       image: 'ghcr.io/gameservermanagers/gameserver:mh' },
  ark:       { lgsmId: 'arkserver',     lgsmTag: 'ark',      image: 'ghcr.io/gameservermanagers/gameserver:ark' },
  rust:      { lgsmId: 'rustserver',    lgsmTag: 'rust',     image: 'ghcr.io/gameservermanagers/gameserver:rust' },
  vh:        { lgsmId: 'vhserver',      lgsmTag: 'vh',       image: 'ghcr.io/gameservermanagers/gameserver:vh' },
  sdtd:      { lgsmId: 'sdtdserver',    lgsmTag: 'sdtd',     image: 'ghcr.io/gameservermanagers/gameserver:sdtd' },
  pz:        { lgsmId: 'pzserver',      lgsmTag: 'pz',       image: 'ghcr.io/gameservermanagers/gameserver:pz' },
  gmod:      { lgsmId: 'gmodserver',    lgsmTag: 'gmod',     image: 'ghcr.io/gameservermanagers/gameserver:gmod' },
  factorio:  { lgsmId: 'factorioserver',lgsmTag: 'factorio', image: 'ghcr.io/gameservermanagers/gameserver:factorio' },
  sf:        { lgsmId: 'sfserver',      lgsmTag: 'sf',       image: 'ghcr.io/gameservermanagers/gameserver:sf' },
  arma3:     { lgsmId: 'arma3server',   lgsmTag: 'arma3',    image: 'ghcr.io/gameservermanagers/gameserver:arma3' },
  ac:        { lgsmId: 'acserver',      lgsmTag: 'ac',       image: 'ghcr.io/gameservermanagers/gameserver:ac' },
}

const randHex = (n = 12) =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(n))).toString('hex').slice(0, n).toUpperCase()

const error = (status: number, body: any) => 
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// ── Row → camelCase helper ─────────────────────────────────────────────────
function rowToServer(row: Record<string, any>) {
  const sftpPort = 2220 + parseInt(row.id.replace(/\D/g, '')) % 1000
  return {
    ...row,
    maxPlayers:         row.max_players,
    mcType:             row.mc_type,
    mcVersion:          row.version,
    onlineMode:         row.online_mode,
    viewDistance:       row.view_distance,
    enableCommandBlock: row.enable_command_block,
    allowFlight:        row.allow_flight,
    spawnProtection:    row.spawn_protection,
    extraEnvVars:       row.extra_env_vars,
    players:     { online: 0, max: row.max_players },
    ram:         { used: 0,   alloc: parseInt(row.memory) * 1024 || 4096 },
    cpu:         0,
    uptime:      '—',
    sftpPass:    row.sftp_password,
    sftpPort,
    sftpUser:    `sftp-${row.dokloy_app}`,
    ip:          process.env.PUBLIC_IP || process.env.DOKPLOY_URL?.replace(/^https?:\/\//, '') || 'votre_ip_serveur',
    dokployApp:  row.dokloy_app,
  }
}

// ── Routes ─────────────────────────────────────────────────────────────────

export const serversRoutes = new Elysia({ prefix: '/servers' })

  // List
  .get('/', async () => {
    const { rows } = await db.query('SELECT * FROM servers ORDER BY created_at DESC')
    return rows.map(rowToServer)
  })

  // Get one
  .get('/:id', async ({ params: { id } }) => {
    const { rows } = await db.query('SELECT * FROM servers WHERE id = $1', [id])
    if (!rows[0]) return error(404, { message: 'Serveur introuvable' })
    return rowToServer(rows[0])
  })

  // Create
  .post('/', async ({ body }) => {
    const { game, name, port, memory, maxPlayers, motd = '', ...rest } = body as any
    const max_players = maxPlayers

    const gameInfo = GAME_CATALOG[game]
    if (!gameInfo) return error(400, { message: `Jeu inconnu: ${game}` })

    // Check port conflict
    const { rows: conflict } = await db.query(
      "SELECT id FROM servers WHERE port = $1 AND status != 'offline'", [port]
    )
    if (conflict.length > 0) return error(409, { message: 'Port déjà utilisé' })

    const id          = `srv-${Date.now()}`
    const sftpPassword = randHex(12)
    const dokployApp  = `${game}-${name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 40)}`
    const image       = gameInfo.image

    await db.query(
      `INSERT INTO servers
        (id, name, game, image, lgsm_id, lgsm_tag, status, port, memory, max_players,
         motd, mc_type, version, difficulty, gamemode, pvp, online_mode, whitelist,
         seed, view_distance, enable_command_block, allow_flight, spawn_protection,
         extra_env_vars, dokloy_app, sftp_password, created_at)
       VALUES
        ($1,$2,$3,$4,$5,$6,'creating',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
         $19,$20,$21,$22,$23,$24,$25,NOW())`,
      [
        id, name, game, image, gameInfo.lgsmId, gameInfo.lgsmTag,
        port, memory, max_players, motd,
        rest.mcType ?? null, rest.mcVersion ?? null, rest.difficulty ?? 'normal',
        rest.gamemode ?? 'survival', rest.pvp ?? true, rest.onlineMode ?? true,
        rest.whitelist ?? false, rest.seed ?? '', rest.viewDistance ?? 10,
        rest.enableCommandBlock ?? false, rest.allowFlight ?? false,
        rest.spawnProtection ?? 16,
        JSON.stringify(rest.extraEnvVars ?? {}),
        dokployApp, sftpPassword,
      ]
    )

    const newServer = {
      id, game, name, image,
      lgsm_id: gameInfo.lgsmId, lgsm_tag: gameInfo.lgsmTag,
      status: 'creating', port, memory, max_players, motd,
      mc_type: rest.mcType, version: rest.mcVersion,
      difficulty: rest.difficulty ?? 'normal', gamemode: rest.gamemode ?? 'survival',
      pvp: rest.pvp ?? true, online_mode: rest.onlineMode ?? true,
      whitelist: rest.whitelist ?? false, seed: rest.seed ?? '',
      view_distance: rest.viewDistance ?? 10,
      enable_command_block: rest.enableCommandBlock ?? false,
      allow_flight: rest.allowFlight ?? false,
      spawn_protection: rest.spawnProtection ?? 16,
      extra_env_vars: rest.extraEnvVars ?? {},
      dokloy_app: dokployApp, sftp_password: sftpPassword,
      players: { online: 0, max: max_players },
      ram: { used: 0, alloc: parseInt(memory) * 1024 || 4096 },
      cpu: 0, uptime: '—',
    }

    // Deploy async — ne bloque pas la réponse
    ;(async () => {
      try {
        const { composeId } = await createApplication(newServer as any)
        await db.query(
          "UPDATE servers SET compose_id = $1, status = 'starting' WHERE id = $2",
          [composeId, id]
        )
        // Transition vers online après 45 secondes (le temps de pull l'image et démarrer)
        setTimeout(() => {
          db.query("UPDATE servers SET status = 'online' WHERE id = $1", [id]).catch(console.error)
        }, 45000)
      } catch (e) {
        console.error('[Deploy]', id, e)
        await db.query("UPDATE servers SET status = 'error' WHERE id = $1", [id])
      }
    })()

    return rowToServer(newServer as any)
  }, {
    body: t.Object({
      game:        t.String(),
      name:        t.String({ minLength: 2, maxLength: 64 }),
      port:        t.Number({ minimum: 1025, maximum: 65534 }),
      memory:      t.String(),
      maxPlayers:  t.Number({ minimum: 1, maximum: 500 }),
      motd:        t.Optional(t.String()),
      mcType:      t.Optional(t.String()),
      mcVersion:   t.Optional(t.String()),
      difficulty:  t.Optional(t.String()),
      gamemode:    t.Optional(t.String()),
      pvp:         t.Optional(t.Boolean()),
      onlineMode:  t.Optional(t.Boolean()),
      whitelist:   t.Optional(t.Boolean()),
      seed:        t.Optional(t.String()),
      viewDistance:         t.Optional(t.Number()),
      enableCommandBlock:   t.Optional(t.Boolean()),
      allowFlight:          t.Optional(t.Boolean()),
      spawnProtection:      t.Optional(t.Number()),
      extraEnvVars:         t.Optional(t.Record(t.String(), t.String())),
    }),
  })

  // Actions: start / stop / restart
  .post('/:id/:action', async ({ params: { id, action } }) => {
    const { rows } = await db.query('SELECT * FROM servers WHERE id = $1', [id])
    const s = rows[0]
    if (!s) return error(404, { message: 'Serveur introuvable' })
    if (!s.compose_id) return error(400, { message: 'Serveur pas encore déployé' })

    if (action === 'start' || action === 'restart') {
      await db.query("UPDATE servers SET status = 'starting' WHERE id = $1", [id])
      try {
        await deployApp(s.compose_id)
        // Transition vers online après 15 secondes
        setTimeout(() => {
          db.query("UPDATE servers SET status = 'online' WHERE id = $1", [id]).catch(console.error)
        }, 15000)
        return { ok: true, status: 'starting' }
      } catch (e: any) {
        return error(500, { message: e.message })
      }
    }
    if (action === 'stop') {
      await db.query("UPDATE servers SET status = 'stopping' WHERE id = $1", [id])
      try {
        await stopApp(s.compose_id)
        await db.query("UPDATE servers SET status = 'offline', cpu = 0 WHERE id = $1", [id])
        return { ok: true, status: 'offline' }
      } catch (e: any) {
        return error(500, { message: e.message })
      }
    }
    
    if (action === 'sync') {
      try {
        const dokployStatus = await getAppStatus(s.compose_id)
        // Map dokploy status to ours (running -> online, stopped -> offline, etc.)
        let newStatus = s.status
        if (dokployStatus === 'running' || dokployStatus === 'online') newStatus = 'online'
        else if (dokployStatus === 'stopped' || dokployStatus === 'offline') newStatus = 'offline'
        else if (dokployStatus === 'error') newStatus = 'error'
        else {
          // Si on ne peut pas map, on regarde si on est bloqué depuis longtemps
          // Par sécurité, on bascule à online si bloqué en starting
          if (s.status === 'starting' || s.status === 'creating') newStatus = 'online'
          if (s.status === 'stopping') newStatus = 'offline'
        }

        await db.query("UPDATE servers SET status = $1 WHERE id = $2", [newStatus, id])
        return { ok: true, status: newStatus }
      } catch (e: any) {
        return error(500, { message: e.message })
      }
    }
    
    if (action === 'reset_map') {
      await db.query("UPDATE servers SET status = 'stopping' WHERE id = $1", [id])
      try {
        await wipeServerMap(rowToServer(s) as any)
        
        // Restart the server
        await db.query("UPDATE servers SET status = 'starting' WHERE id = $1", [id])
        await deployApp(s.compose_id)
        
        return { ok: true, status: 'starting' }
      } catch (e: any) {
        return error(500, { message: e.message })
      }
    }
    
    return error(400, { message: 'Action invalide (start|stop|restart|sync|reset_map)' })
  })

  // Logs
  .get('/:id/logs', async ({ params: { id }, query }) => {
    const { rows } = await db.query('SELECT compose_id, dokloy_app FROM servers WHERE id = $1', [id])
    if (!rows[0]?.compose_id) return error(404, { message: 'Serveur introuvable' })
    
    let lines: string[] = []
    try {
      // Pour une application compose dans Dokploy, l'appName correspond généralement 
      // au nom du service défini dans le docker-compose.yml, par ex: rows[0].dokloy_app
      lines = await getAppLogs(rows[0].compose_id, rows[0].dokloy_app, Number(query.lines ?? 200))
    } catch (e: any) {
      lines = [`Erreur lors de la récupération des logs: ${e.message}`]
    }
    
    return { lines }
  })

  // Update settings
  .patch('/:id', async ({ params: { id }, body }) => {
    const { rows } = await db.query('SELECT * FROM servers WHERE id = $1', [id])
    if (!rows[0]) return error(404, { message: 'Serveur introuvable' })
    const b = body as any
    await db.query(
      `UPDATE servers SET
        motd=$1, memory=$2, max_players=$3, difficulty=$4, gamemode=$5,
        pvp=$6, online_mode=$7, whitelist=$8, seed=$9, view_distance=$10,
        enable_command_block=$11, allow_flight=$12, spawn_protection=$13,
        extra_env_vars=$14
       WHERE id=$15`,
      [b.motd, b.memory, b.maxPlayers ?? b.max_players, b.difficulty, b.gamemode,
       b.pvp, b.onlineMode ?? b.online_mode, b.whitelist, b.seed, b.viewDistance ?? b.view_distance,
       b.enableCommandBlock ?? b.enable_command_block, b.allowFlight ?? b.allow_flight, b.spawnProtection ?? b.spawn_protection,
       b.extraEnvVars ?? b.extra_env_vars ?? {}, id]
    )
    if (rows[0].compose_id) {
      try {
        const updated = (await db.query('SELECT * FROM servers WHERE id = $1', [id])).rows[0]
        await updateApplication(updated, updated.status)
      } catch (e) {
        console.error('Failed to update compose:', e)
      }
    }
    return { ok: true }
  })

  // Delete
  .delete('/:id', async ({ params: { id } }) => {
    const { rows } = await db.query('SELECT compose_id FROM servers WHERE id = $1', [id])
    if (!rows[0]) return error(404, { message: 'Serveur introuvable' })
    if (rows[0].compose_id) await deleteApp(rows[0].compose_id).catch(() => {})
    await db.query('DELETE FROM servers WHERE id = $1', [id])
    return { ok: true }
  })
