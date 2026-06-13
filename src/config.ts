export interface Config {
  bot: {
    token: string;
  };
  database: {
    name: string;
    password: string;
    url: string;
    port: string;
    database: string;
  };
  mtproto?: {
    apiId: number;
    apiHash: string;
    session: string;
  };
}

const defaultConfigPath = new URL("../config.toml", import.meta.url);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pathToString(path: string | URL): string {
  return path instanceof URL ? path.pathname : path;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function loadConfig(path: string | URL = defaultConfigPath): Promise<Config> {
  const file = Bun.file(path);
  const configPath = pathToString(path);

  if (!(await file.exists())) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  let parsed: unknown;

  try {
    parsed = Bun.TOML.parse(await file.text());
  } catch (error) {
    throw new Error(`Failed to parse config file ${configPath}: ${errorMessage(error)}`);
  }

  if (!isRecord(parsed) || !isRecord(parsed.bot)) {
    throw new Error('Config file must contain a [bot] section');
  }

  const token = parsed.bot.token;

  if (typeof token !== "string" || token.trim().length === 0) {
    throw new Error('Config value "bot.token" must be a non-empty string');
  }

  const database = parseDatabaseConfig(parsed.database);
  const mtproto = parseMtprotoConfig(parsed.mtproto);

  return {
    bot: {
      token: token.trim(),
    },
    database,
    ...(mtproto ? { mtproto } : {}),
  };
}

function parseDatabaseConfig(value: unknown): Config["database"] {
  if (!isRecord(value)) {
    throw new Error('Config file must contain a [database] section');
  }

  const name = parseNonEmptyString(value.name, "database.name");
  const password = parseNonEmptyString(value.password, "database.password");
  const url = parseNonEmptyString(value.url, "database.url");
  const port = parseNonEmptyString(value.port, "database.port");
  const database = parseNonEmptyString(value.database, "database.database");

  return {
    name,
    password,
    url,
    port,
    database,
  };
}

function parseMtprotoConfig(value: unknown): Config["mtproto"] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new Error('Config value "mtproto" must be a table');
  }

  const apiId = value.api_id;
  const apiHash = value.api_hash;
  const session = value.session;

  if (typeof apiId !== "number" || !Number.isInteger(apiId) || apiId <= 0) {
    throw new Error('Config value "mtproto.api_id" must be a positive integer');
  }

  if (typeof apiHash !== "string" || apiHash.trim().length === 0) {
    throw new Error('Config value "mtproto.api_hash" must be a non-empty string');
  }

  if (session !== undefined && (typeof session !== "string" || session.trim().length === 0)) {
    throw new Error('Config value "mtproto.session" must be a non-empty string');
  }

  return {
    apiId,
    apiHash: apiHash.trim(),
    session: session?.trim() ?? "mtproto.session",
  };
}

function parseNonEmptyString(value: unknown, key: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Config value "${key}" must be a non-empty string`);
  }

  return value.trim();
}
