import {defineConfig, loadEnv} from "vite";
import react from "@vitejs/plugin-react";
import {NodeGlobalsPolyfillPlugin} from "@esbuild-plugins/node-globals-polyfill";
import rollupNodePolyFill from "rollup-plugin-node-polyfills";
import inject from "@rollup/plugin-inject";
import * as path from "path";
import {nodePolyfills} from "vite-plugin-node-polyfills";

function hash() {
  return Math.floor(Math.random() * 90000) + 10000;
}

export default defineConfig(({mode}) => {
  // get env from root of workspace
  const env = loadEnv(mode, `${process.cwd()}/../../`, "");
  // const env = loadEnv(mode, process.cwd(), "");
  env.PORT = env.PORT ? env.PORT : "3001";
  env.ENV = env.ENV ? env.ENV : "dev";

  const alias: Record<any, any> = {
    // note: do not uncomment this or vercel says "process is not defined" stack tracing to dependency.
    // crypto: "crypto-browserify",
    buffer: "buffer",
    stream: "stream-browserify",
    assert: "assert",
    http: "stream-http",
    https: "https-browserify",
    url: "url",
    util: "util",
    fs: "fs",
    zlib: "zlib",
    events: "events",
  };
  if (env.ENV === "dev") {
    console.log("using @cosmic-lab/prop-shop-sdk symlink for development");
    alias["@cosmic-lab/prop-shop-sdk"] = path.resolve(__dirname, "../sdk");
  }

  return {
    resolve: {
      alias,
    },
    server: {
      proxy: {
        "/api": "http://localhost:5173",
      },
      cors: true,
      strictPort: true,
      port: 5173,
    },
    define: {
      global: "globalThis",
      "process.env.RPC_URL": JSON.stringify(env.RPC_URL),
      "process.env.ENV": JSON.stringify(env.ENV),
      "process.env.PORT": JSON.stringify(env.PORT),
      "process.env.REDIS_ENDPOINT": JSON.stringify(env.REDIS_ENDPOINT),
      "process.env.REDIS_PASSWORD": JSON.stringify(env.REDIS_PASSWORD),
    },
    plugins: [react(), nodePolyfills()],
    optimizeDeps: {
      esbuildOptions: {
        define: {
          global: "globalThis",
        },
        plugins: [
          NodeGlobalsPolyfillPlugin({
            process: true,
            buffer: true,
          }),
        ],
      },
      // https://vitejs.dev/guide/dep-pre-bundling.html#monorepos-and-linked-dependencies
      include: ["@cosmic-lab/prop-shop-sdk"],
      // restart of app will recompile deps
      force: true,
    },
    build: {
      rollupOptions: {
        plugins: [
          rollupNodePolyFill() as any,
          inject({
            Buffer: ["buffer", "Buffer"],
          }),
        ],
        external: [
          "crypto",
          "@drift-labs/vaults-sdk",
          "@cosmic-lab/prop-shop-sdk",
        ],
        output: {
          entryFileNames: `[name]` + hash() + `.js`,
          chunkFileNames: `[name]` + hash() + `.js`,
          assetFileNames: `[name]` + hash() + `.[ext]`,
        },
      },
      commonjsOptions: {
        transformMixedEsModules: true,
        // https://vitejs.dev/guide/dep-pre-bundling.html#monorepos-and-linked-dependencies
        include: [/@cosmic-lab\/prop-shop-sdk/, /node_modules/],
      },
    },
    publicDir: "static",
  };
});
