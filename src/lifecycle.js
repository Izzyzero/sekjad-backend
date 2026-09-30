async function startServer({ app, connect, disconnect, validate, port, signals = process,
    exit = (code) => process.exit(code), logger = console, shutdownTimeoutMs = 25000 }) {
    let server;
    let stopping = false;
    let shutdownPromise;
    let stage = 'configuration';
    const handlers = {};
    const removeSignals = () => {
        for (const [signal, handler] of Object.entries(handlers)) signals.removeListener(signal, handler);
    };
    const shutdown = (signal) => {
        if (stopping) return shutdownPromise;
        stopping = true;
        app.locals.shuttingDown = true;
        logger.log(`Shutting down (${signal})`);
        const deadline = setTimeout(() => {
            logger.error('Shutdown timed out');
            server?.closeAllConnections?.();
            exit(1);
        }, shutdownTimeoutMs);
        shutdownPromise = (async () => {
            try {
                if (server?.listening) await new Promise((resolve, reject) => {
                    server.close((error) => error ? reject(error) : resolve());
                    server.closeIdleConnections?.();
                });
                await disconnect();
                exit(0);
            } catch {
                logger.error('Shutdown failed');
                exit(1);
            } finally {
                clearTimeout(deadline);
                removeSignals();
            }
        })();
        return shutdownPromise;
    };
    try {
        validate();
        for (const signal of ['SIGTERM', 'SIGINT']) {
            handlers[signal] = () => { void shutdown(signal); };
            signals.on(signal, handlers[signal]);
        }
        stage = 'database';
        await connect();
        if (stopping) return { shutdown };
        stage = 'listener';
        server = await new Promise((resolve, reject) => {
            const listener = app.listen(port, '0.0.0.0');
            listener.once('error', reject);
            listener.once('listening', () => {
                listener.removeListener('error', reject);
                resolve(listener);
            });
        });
        logger.log(`Server listening on port ${server.address().port}`);
        return { server, shutdown };
    } catch (error) {
        removeSignals();
        // Never print database URIs, passwords, or provider error objects.
        logger.error(startupErrorMessage(error, stage, port));
        const deadline = setTimeout(() => exit(1), shutdownTimeoutMs);
        try { await disconnect(); } catch { /* Preserve the startup failure. */ }
        clearTimeout(deadline);
        exit(1);
        return null;
    }
}
function startupErrorMessage(error, stage, port) {
    if (error.code === 'INVALID_CONFIG') return error.message;
    if (stage === 'listener') {
        if (error.code === 'EADDRINUSE') return `Startup failed: port ${port} is already in use. Stop the other server or change PORT.`;
        if (error.code === 'EACCES') return `Startup failed: permission denied when binding port ${port}.`;
        return 'Startup failed: HTTP listener could not start.';
    }
    if (stage === 'database') {
        const errors = [error, error.cause, ...(error.reason?.servers?.values?.() || [])]
            .flatMap((entry) => [entry, entry?.error, entry?.error?.cause]).filter(Boolean);
        const codes = errors.map((entry) => entry.code);
        if (codes.includes(18) || codes.includes('AuthenticationFailed')) return 'Startup failed: MongoDB authentication failed. Check the database username and password in MONGO_URI.';
        if (codes.includes('EACCES') || codes.includes('EPERM')) return 'Startup failed: MongoDB network access was denied. Check firewall or sandbox permissions.';
        if (codes.includes('ENOTFOUND') || codes.includes('EAI_AGAIN')) return 'Startup failed: MongoDB DNS lookup failed. Check the cluster hostname and DNS connectivity.';
        return 'Startup failed: MongoDB connection could not be established. Check network access, Atlas IP access rules, cluster availability, and MONGO_URI.';
    }
    return 'Startup failed: application configuration could not be loaded.';
}
module.exports = { startServer, startupErrorMessage };
