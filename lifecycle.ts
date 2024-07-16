import { exec } from "child_process";

const startCommand = "yarn execute";

function start() {
  console.log("Starting React app and proxy server...");
  exec(startCommand, (error, stdout, stderr) => {
    console.log(`stdout: ${stdout}`);
    if (error || stderr.length > 0) {
      console.error(`exec error: ${error || stderr}`);
      return;
    }
  });
}

function stop() {
  console.log("Stopping React app and proxy server...");
  exec(`pgrep -f '${startCommand}'`, (error, stdout, stderr) => {
    if (stdout.length > 0) {
      console.log(`stdout: ${stdout}`);
    }
    if (error || stderr.length > 0) {
      console.error(
        `Error finding process \"${startCommand}\": ${error || stderr}`,
      );
      return;
    }
    const pid = stdout.trim();
    if (pid) {
      exec(`kill -9 ${pid}`, (killError, killStdout, killStderr) => {
        if (killStdout.length > 0) {
          console.log(`killStdout: ${killStdout}`);
        }
        if (killError || killStderr.length > 0) {
          console.error(`Error stopping process: ${killError || killStderr}`);
          return;
        }
        console.log("Process stopped successfully");
      });
    } else {
      console.log("No process found");
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
