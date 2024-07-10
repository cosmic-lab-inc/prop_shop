import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { NodeGlobalsPolyfillPlugin } from "@esbuild-plugins/node-globals-polyfill";
import rollupNodePolyFill from "rollup-plugin-node-polyfills";
import inject from "@rollup/plugin-inject";
import * as path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  let alias: Record<any, any> = {
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
  };
  if (env.ENV === "dev") {
    console.log("using @cosmic-lab/prop-shop-sdk from source");
    alias["@cosmic-lab/prop-shop-sdk"] = path.resolve(
      __dirname,
      "../sdk/src/index.ts",
    );
  }

  return {
    resolve: {
      alias,
    },
    define: {
      "process.env.RPC_URL": JSON.stringify(env.RPC_URL),
      "process.env.ENV": JSON.stringify(env.ENV),
      global: "globalThis",
    },
    plugins: [react()],
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
