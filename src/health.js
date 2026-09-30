const createHealthHandler = (connection, isShuttingDown, timeoutMs = 2000) => async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    let timer;
    try {
        if (isShuttingDown() || connection.readyState !== 1) throw new Error('Not ready');
        await Promise.race([
            connection.db.admin().ping({ timeoutMS: timeoutMs }),
            new Promise((_resolve, reject) => {
                timer = setTimeout(() => reject(new Error('Health check timed out')), timeoutMs);
            }),
        ]);
        if (isShuttingDown() || connection.readyState !== 1) throw new Error('Not ready');
        return res.status(200).json({ status: 'ok' });
    } catch {
        return res.status(503).json({ status: 'unavailable' });
    } finally {
        clearTimeout(timer);
    }
};
module.exports = { createHealthHandler };
