import { createClient, RedisClientType, RedisDefaultModules } from "redis";
import { RedisFunctions, RedisModules, RedisScripts } from "@redis/client";

type Client = RedisClientType<
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
    if (password) {
      // split port from url by delimiting the last colon
      const [host, port] = url.split(":").slice(-1);
      const client = createClient({
        password,
        socket: {
          host,
          port: Number(port),
        },
      });
      return new RedisClient(url, client);
    } else {
      const client: Client = await createClient({
        url,
      })
        .on("error", (err) => console.log("Redis Client Error", err))
        .connect();
      return new RedisClient(url, client);
    }
  }

  public async set(key: string, value: string): Promise<void> {
    const res = await this.client.set(key, value);
    console.log("set result:", res);
  }

  public async get(key: string): Promise<string | null> {
    const res = await this.client.get(key);
    console.log("get result:", res);
    return res;
  }
}
