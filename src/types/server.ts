export interface GameServer {
  id: string
  name: string
  game: string            // "minecraft" | "cs2" | "ark" | "vh" | ...
  image: string           // docker image
  lgsm_id?: string        // "cs2server", "arkserver", ...
  lgsm_tag?: string       // docker tag: "cs2", "ark", ...
  status: ServerStatus
  port: number
  memory: string          // "4G"
  max_players: number
  motd?: string
  ip?: string
  // Minecraft only (itzg)
  mc_type?: string        // PAPER | FORGE | FABRIC | ...
  version?: string        // LATEST | 1.21.1 | ...
  difficulty?: string
  gamemode?: string
  pvp?: boolean
  online_mode?: boolean
  whitelist?: boolean
  seed?: string
  view_distance?: number
  enable_command_block?: boolean
  allow_flight?: boolean
  spawn_protection?: number
  extra_env_vars?: Record<string, string>
  // Dokploy
  dokloy_app: string
  compose_id?: string
  sftp_password: string
  created_at: string
}

export type ServerStatus =
  | 'online' | 'offline' | 'starting' | 'stopping' | 'creating' | 'error'

export interface CreateServerDTO {
  name: string
  game: string
  port: number
  memory: string
  max_players: number
  motd?: string
  // Minecraft only
  mc_type?: string
  version?: string
  difficulty?: string
  gamemode?: string
  pvp?: boolean
  online_mode?: boolean
  whitelist?: boolean
  seed?: string
  view_distance?: number
  enable_command_block?: boolean
  allow_flight?: boolean
  spawn_protection?: number
  extra_env_vars?: Record<string, string>
}
