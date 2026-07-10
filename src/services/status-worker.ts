import { db } from '../db'
import { getAppStatus } from './dokploy'

export function startStatusWorker() {
  // Tourne toutes les 10 secondes
  setInterval(async () => {
    try {
      // On récupère les serveurs qui sont dans un état de transition
      const { rows } = await db.query(
        "SELECT id, status, compose_id FROM servers WHERE status IN ('starting', 'stopping', 'creating') AND compose_id IS NOT NULL"
      )
      
      for (const server of rows) {
        try {
          const dokployStatus = await getAppStatus(server.compose_id)
          let newStatus = server.status

          if (dokployStatus === 'running' || dokployStatus === 'online') newStatus = 'online'
          else if (dokployStatus === 'stopped' || dokployStatus === 'offline') newStatus = 'offline'
          else if (dokployStatus === 'error') newStatus = 'error'

          // Mettre à jour si le statut a changé
          if (newStatus !== server.status && newStatus !== 'unknown') {
            await db.query("UPDATE servers SET status = $1 WHERE id = $2", [newStatus, server.id])
            console.log(`[StatusWorker] Serveur ${server.id} est passé de ${server.status} à ${newStatus}`)
          }
        } catch (err) {
          console.error(`[StatusWorker] Erreur pour ${server.id}:`, err)
        }
      }
    } catch (err) {
      console.error('[StatusWorker] Erreur globale:', err)
    }
  }, 10000)
}
