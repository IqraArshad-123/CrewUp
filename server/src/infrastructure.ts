import Redis from "ioredis";
import { RedisStore, type RedisReply } from "rate-limit-redis";
import { config } from "./config";
import { createHash } from "node:crypto";
export const redis = config.REDIS_URL
  ? new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      commandTimeout: 3000,
      enableOfflineQueue: false,
    })
  : null;
redis?.on("error", () => {});
export function rateStore(prefix: string) {
  return redis
    ? new RedisStore({
        prefix: `crewup:limit:${prefix}:`,
        sendCommand: (command: string, ...args: string[]) =>
          redis!.call(command, ...args) as Promise<RedisReply>,
      })
    : undefined;
}
export async function invalidateBoard() {
  if (redis) await redis.incr("crewup:board:version").catch(() => {});
}
export async function boardCacheKey(query: unknown) {
  if (!redis) return null;
  try {
    const v = (await redis.get("crewup:board:version")) || "0";
    return `crewup:board:${v}:${createHash("sha256").update(JSON.stringify(query)).digest("hex")}`;
  } catch {
    return null;
  }
}
export function log(event: string, fields: Record<string, unknown> = {}) {
  console.log(
    JSON.stringify({ time: new Date().toISOString(), event, ...fields }),
  );
}

export async function readyRedis(){if(!redis)return;if(redis.status==='ready')return;await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{cleanup();reject(new Error('Redis unavailable'));},5000);const ready=()=>{cleanup();resolve();};const cleanup=()=>{clearTimeout(timer);redis!.off('ready',ready);};redis.on('ready',ready);});}
