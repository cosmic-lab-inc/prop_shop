import { exec } from "child_process";

const startCommand = "yarn start";

function start() {
  console.log("Starting React app and proxy server...");
  exec(startCommand, (error, stdout, stderr) => {
    console.log(`stdout: ${stdout}`);
    console.error(`stderr: ${stderr}`);
    if (error || stderr) {
      console.error(`exec error: ${error || stderr}`);
      return;
    }
  });
}

function stop() {
  console.log("Stopping React app and proxy server...");
  exec(`pgrep -f '${startCommand}'`, (error, stdout, stderr) => {
    console.log(`stdout: ${stdout}`);
    console.error(`stderr: ${stderr}`);
    if (error || stderr) {
      console.error(
        `Error finding process \"${startCommand}\": ${error || stderr}`,
      );
      return;
    }
    const pid = stdout.trim();
    if (pid) {
      exec(`kill -9 ${pid}`, (killError, killStdout, killStderr) => {
        console.log(`killStdout: ${killStdout}`);
        console.error(`killStderr: ${killStderr}`);
        if (killError || killStderr) {
          console.error(`Error stopping process: ${killError || killStderr}`);
          return;
        }
        console.log("React development server stopped successfully.");
      });
    } else {
      console.log("No React development server process found.");
    }
  });
}

// Graceful shutdown on SIGINT or SIGTERM
process.on("SIGINT", () => {
  console.log("SIGINT signal received: closing app and server");
  stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing app and server");
  stop();
  process.exit(0);
});

start();
