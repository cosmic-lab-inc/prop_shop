import { PNL, VaultPnl } from "./types";

export class ProxyClient {
  /**
   * Returns historical pnl data from most recent to oldest
   * @param key
   * @param daysBack
   * @param usePrefix set to true if used outside the vite app
   */
  public static async performance(params: {
    key: string;
    usePrefix?: boolean;
  }): Promise<VaultPnl> {
    const { key, usePrefix } = params;
    try {
      let url = "/api/performance";
      if (usePrefix) {
        url = `http://localhost:5173${url}`;
      }
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key,
        }),
      });
      const data: PNL[] = await response.json();
      return new VaultPnl(data);
    } catch (error) {
      console.error(`Error in performance: ${error}`);
      throw new Error(`Error in performance: ${error}`);
    }
  }

  public static async set(
    key: string,
    value: string,
    usePrefix?: boolean,
  ): Promise<string | null> {
    try {
      let url = "/api/set";
      if (usePrefix) {
        url = `http://localhost:5173${url}`;
      }
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key,
          value,
        }),
      });
      return await response.json();
    } catch (error) {
      console.error(`Error in set: ${error}`);
      throw new Error(`Error in set: ${error}`);
    }
  }

  public static async get(key: string, usePrefix?: boolean): Promise<any> {
    try {
      let url = "/api/get";
      if (usePrefix) {
        url = `http://localhost:5173${url}`;
      }
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key,
        }),
      });
      return await response.json();
    } catch (error) {
      console.error(`Error in get: ${error}`);
      throw new Error(`Error in get: ${error}`);
    }
  }
}
