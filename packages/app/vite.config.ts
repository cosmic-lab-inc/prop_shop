import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { NodeGlobalsPolyfillPlugin } from "@esbuild-plugins/node-globals-polyfill";
import rollupNodePolyFill from "rollup-plugin-node-polyfills";
import inject from "@rollup/plugin-inject";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    resolve: {
      alias: {
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
      },
    },
    define: {
      "process.env.RPC_URL": JSON.stringify(env.RPC_URL),
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
