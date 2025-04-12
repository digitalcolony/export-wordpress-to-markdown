/**
 * Sets up process cleanup handlers for graceful shutdown
 * - Handles SIGINT (Ctrl+C)
 * - Handles SIGTERM (termination request)
 * - Handles uncaught exceptions
 * - Ensures cleanup only runs once
 */
export function setupCleanup() {
	// Flag to prevent multiple cleanup runs
	let isCleaningUp = false;

	/**
	 * Performs cleanup tasks and exits process
	 * - Checks if cleanup is already running
	 * - Sets cleanup flag to prevent re-entry
	 * - Logs cleanup status
	 * - Exits process with success code
	 */
	async function cleanup() {
		// Prevent multiple cleanup attempts
		if (isCleaningUp) return;
		isCleaningUp = true;

		console.log("\nCleaning up...");
		// Add any cleanup tasks here, such as:
		// - Closing file handles
		// - Completing in-progress operations
		// - Saving state
		process.exit(0);
	}

	// Handle Ctrl+C and kill commands
	process.on("SIGINT", cleanup);
	process.on("SIGTERM", cleanup);

	// Handle unexpected errors
	process.on("uncaughtException", async (error) => {
		console.error("Uncaught exception:", error);
		await cleanup();
	});
}
