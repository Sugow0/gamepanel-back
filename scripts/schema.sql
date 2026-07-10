-- GamePanel — schema PostgreSQL
-- Exécuté automatiquement par Docker au premier démarrage

CREATE TABLE IF NOT EXISTS servers (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  game                  TEXT NOT NULL DEFAULT 'minecraft',
  image                 TEXT NOT NULL,
  lgsm_id               TEXT,
  lgsm_tag              TEXT,
  status                TEXT NOT NULL DEFAULT 'creating'
                          CHECK (status IN ('online','offline','starting','stopping','creating','error')),
  port                  INTEGER NOT NULL UNIQUE
                          CHECK (port BETWEEN 1025 AND 65534),
  memory                TEXT NOT NULL DEFAULT '4G',
  max_players           INTEGER NOT NULL DEFAULT 20,
  motd                  TEXT NOT NULL DEFAULT '',

  -- Minecraft / itzg only
  mc_type               TEXT,
  version               TEXT,
  difficulty            TEXT DEFAULT 'normal',
  gamemode              TEXT DEFAULT 'survival',
  pvp                   BOOLEAN DEFAULT true,
  online_mode           BOOLEAN DEFAULT true,
  whitelist             BOOLEAN DEFAULT false,
  seed                  TEXT DEFAULT '',
  view_distance         INTEGER DEFAULT 10,
  enable_command_block  BOOLEAN DEFAULT false,
  allow_flight          BOOLEAN DEFAULT false,
  spawn_protection      INTEGER DEFAULT 16,
  extra_env_vars        JSONB DEFAULT '{}',

  -- Dokploy
  dokloy_app            TEXT NOT NULL,
  compose_id            TEXT,
  sftp_password         TEXT NOT NULL,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_servers_status ON servers(status);
CREATE INDEX IF NOT EXISTS idx_servers_game   ON servers(game);
