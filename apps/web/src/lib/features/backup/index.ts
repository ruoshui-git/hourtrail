export function backupNudge(
	lastBackupAt: number | null,
	now: number,
): 'none' | 'missing' | 'stale' {
	if (lastBackupAt === null) return 'missing';
	return now - lastBackupAt > 30 * 24 * 60 * 60_000 ? 'stale' : 'none';
}
