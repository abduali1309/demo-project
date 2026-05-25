export function getUniqueLogsById(logs: Log[]) {
    const seenIds = new Set();
    return logs.filter(log => {
        if (seenIds.has(log.id)) {
            return false;
        }
        seenIds.add(log.id);
        return true;
    });
}
export function groupLogsByDrivers(logs: Log[], driverId: number) {
    logs = getUniqueLogsById(logs)
    const invalidLog = logs.find(
        log => log.driverId !== driverId && log.codriverId !== driverId
    );
}

interface Log {
    id: number;
    driverId: number;
    codriverId: number;
    message: string;
}