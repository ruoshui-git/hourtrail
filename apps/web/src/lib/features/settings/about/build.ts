export function formatStorageUsage(bytes: number | undefined): string {
	if (bytes === undefined || !Number.isFinite(bytes) || bytes < 0)
		return 'Storage usage unavailable';
	const megabytes = bytes / (1024 * 1024);
	return `${megabytes.toLocaleString(undefined, { maximumFractionDigits: 1 })} MB used`;
}
