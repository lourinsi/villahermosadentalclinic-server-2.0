const net = require("net");
const { spawn } = require("child_process");

const DATABASE_WAIT_TIMEOUT_MS = Number(process.env.DATABASE_WAIT_TIMEOUT_MS || 60000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseDatabaseTarget(connectionString) {
  const url = new URL(connectionString);
  return {
    host: url.hostname,
    port: Number(url.port || 5432),
  };
}

function canConnect({ host, port }) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    socket.setTimeout(1000);

    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });

    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });

    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitForDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  const target = parseDatabaseTarget(process.env.DATABASE_URL);
  const deadline = Date.now() + DATABASE_WAIT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (await canConnect(target)) {
      return;
    }
    console.log(`[BOOT] Waiting for Postgres at ${target.host}:${target.port}...`);
    await sleep(2000);
  }

  throw new Error(`Postgres did not become reachable within ${DATABASE_WAIT_TIMEOUT_MS}ms`);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
      env: process.env,
    });

    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
      }
    });
  });
}

async function main() {
  await waitForDatabase();
  await run("npx", ["prisma", "migrate", "deploy"]);

  const server = spawn("node", ["dist/index.js"], {
    stdio: "inherit",
    env: process.env,
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      server.kill(signal);
    });
  }

  server.once("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code || 0);
    }
  });
}

main().catch((error) => {
  console.error("[BOOT] Failed to start API:", error);
  process.exit(1);
});
