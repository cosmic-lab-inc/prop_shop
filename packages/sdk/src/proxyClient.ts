import { Vault } from "@drift-labs/vaults-sdk";
import { HistoricalSettlePNL } from "./types";

export class ProxyClient {
  /**
   * Returns historical pnl data from most recent to oldest
   * @param vault
   * @param daysBack
   * @param usePrefix set to true if used outside the vite app
   */
  public static async performance(
    vault: Vault,
    daysBack: number,
    usePrefix?: boolean,
  ): Promise<HistoricalSettlePNL[]> {
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
          vaultKey: vault.pubkey.toString(),
          vaultUser: vault.user.toString(),
          daysBack,
        }),
      });
      const data: HistoricalSettlePNL[] = await response.json();
      return data;
    } catch (error) {
      console.error("Error fetching data:", error);
      throw new Error("Error fetching data");
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
      console.error("Error fetching data:", error);
      throw new Error("Error fetching data");
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
      console.error("Error fetching data:", error);
      throw new Error("Error fetching data");
    }
  }
}
