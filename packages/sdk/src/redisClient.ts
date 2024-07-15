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
  url: string;
  client: Client;

  private constructor(url: string, client: Client) {
    this.url = url;
    this.client = client;
  }

  /**
   * redis[s]://[[username][:password]@][host][:port][/db-number]
   */
  public static formatUrl(
    username: string,
    password: string,
    endpoint: string,
    dbNumber?: number,
  ) {
    if (dbNumber) {
      return `redis://${username}:${password}@${endpoint}/${dbNumber}`;
    } else {
      return `redis://${username}:${password}@${endpoint}`;
    }
  }

  /**
   * @param url database connection url
   * @param password if given then assumes admin/write access, otherwise it is public/read-only
   */
  public static async new(
    url: string,
    password?: string,
  ): Promise<RedisClient> {
    let cfg: Options;
    if (password) {
      const [host, port] = url.split(":").slice();
      cfg = {
        password,
        socket: {
          host,
          port: Number(port),
        },
      };
    } else {
      cfg = {
        url,
      };
    }
    const client = await createClient(cfg)
      .on("error", (err) => console.error("Redis Client Error", err))
      .connect();
    return new RedisClient(url, client);
  }

  public async set(key: string, value: string): Promise<void> {
    const res = await this.client.set(key, value);
    if (res && res === "OK") {
      return;
    } else {
      throw new Error("Failed to set key");
    }
  }

  public async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }
}
