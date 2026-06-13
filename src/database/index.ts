import mongoose from "mongoose";

import type { Config } from "../config.ts";

export async function connectDatabase(config: Config["database"]): Promise<void> {
  const uri = buildMongoUri(config);

  await mongoose.connect(uri);

  console.log(`MongoDB connected: ${config.database}`);
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

function buildMongoUri(config: Config["database"]): string {
  const username = encodeURIComponent(config.name);
  const password = encodeURIComponent(config.password);
  const host = `${config.url}:${config.port}`;
  const database = encodeURIComponent(config.database);

  return `mongodb://${username}:${password}@${host}/${database}`;
}
