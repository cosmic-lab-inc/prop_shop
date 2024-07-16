import {
  createClient,
  RedisClientOptions,
  RedisClientType,
  RedisDefaultModules,
} from "redis";
import { RedisFunctions, RedisModules, RedisScripts } from "@redis/client";

type Client = RedisClientType<
  RedisDefaultModules & RedisModules,
  RedisFunctions,
  RedisScripts
>;
type Options = RedisClientOptions<
  RedisDefaultModules & RedisModules,
  RedisFunctions,
  RedisScripts
>;

/**
 * Read only RedisClient for use from the frontend
 */
export class RedisClient {
  private client: Client;
  connected: boolean;

  private constructor(client: Client) {
    this.client = client;
    this.connected = false;
  }

  /**
   * redis[s]://[[username][:password]@][host][:port][/db-number]
   */
  public static formatUrl(
    password: string,
    endpoint: string,
    username?: string,
    dbNumber?: number,
  ) {
    let user = "default";
    if (username) {
      user = username;
    }
    if (dbNumber) {
      return `redis://${user}:${password}@${endpoint}/${dbNumber}`;
    } else {
      return `redis://${user}:${password}@${endpoint}`;
    }
  }

  public static new(params: {
    endpoint: string;
    password: string;
    readonly?: boolean;
  }): RedisClient {
    const [host, port] = params.endpoint.split(":").slice();
    const cfg: Options = {
      password: params.password,
      socket: {
        host,
        port: Number(port),
      },
    };
    const client: Client = createClient(cfg);
    return new RedisClient(client);
  }

  public async connect(): Promise<RedisClient> {
    await this.client
      .on("error", (err) => console.error("Redis Client Error", err))
      .connect();
    this.connected = true;
    return this;
  }

  public async disconnect(): Promise<void> {
    await this.client.quit();
  }

  public async set(key: string, value: string): Promise<string | null> {
    return await this.client.set(key, value);
  }

  public async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  public async delete(key: string): Promise<number> {
    return await this.client.del(key);
  }
}
