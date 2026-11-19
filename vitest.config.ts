import { defineConfig } from "vitest/config";

// One project per MikroORM install, so a single run shows both versions.
export default defineConfig({
    test: {
        testTimeout: 30000,
        projects: [
            { test: { name: "mssql 6.6.16", root: "./v6" } },
            { test: { name: "mssql 7.2.8", root: "./v7" } },
        ],
    },
});
