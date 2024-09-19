import { exec } from 'child_process';

export function getCommandPID(command: string): Promise<number> {
	return new Promise((resolve, reject) => {
		exec('ps -A', (error, stdout, stderr) => {
			if (error) {
				reject(`exec error: ${error}`);
				return;
			}
			if (stderr) {
				reject(`stderr: ${stderr}`);
				return;
			}

			const lines = stdout.split('\n');

			lines.forEach((line) => {
				// Unix 'ps -A' output, PID is the second column
				const parts = line.trim().split(/\s+/);

				for (const part of parts) {
					if (part.includes(command)) {
						const pid = parseInt(parts[0], 10);
						if (!isNaN(pid)) {
							resolve(pid);
						}
					}
				}
			});

			reject(new Error('No process found'));
		});
	});
}

export async function stopProcess(pid: number): Promise<void> {
	return new Promise((resolve, reject) => {
		exec(`kill -9 ${pid}`, (killError, killStdout, killStderr) => {
			if (killStdout.length > 0) {
				console.log(`killStdout: ${killStdout}`);
			}
			if (killError || killStderr.length > 0) {
				reject(new Error(`Error killing process: ${killError || killStderr}`));
				return;
			}
			console.log(`Killed pid: ${pid}`);
			resolve();
		});
	});
}
