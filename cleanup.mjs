export function setupCleanup() {
	let isCleaningUp = false;

	async function cleanup() {
		if (isCleaningUp) return;
		isCleaningUp = true;

		console.log("\nCleaning up...");
		// Add any cleanup tasks here
		process.exit(0);
	}

	process.on("SIGINT", cleanup);
	process.on("SIGTERM", cleanup);
	process.on("uncaughtException", async (error) => {
		console.error("Uncaught exception:", error);
		await cleanup();
	});
}
