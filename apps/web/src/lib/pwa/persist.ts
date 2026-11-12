type StorageWithPersistence = StorageManager & { persist?: () => Promise<boolean> };

export async function requestPersistence(): Promise<'persisted' | 'denied' | 'unsupported'> {
	if (typeof navigator === 'undefined' || !navigator.storage) return 'unsupported';
	const storage = navigator.storage as StorageWithPersistence;
	if (typeof storage.persist !== 'function') return 'unsupported';
	try {
		return (await storage.persist()) ? 'persisted' : 'denied';
	} catch {
		return 'denied';
	}
}

export async function persistenceState(): Promise<'persisted' | 'denied' | 'unsupported'> {
	if (typeof navigator === 'undefined' || !navigator.storage?.persisted) return 'unsupported';
	try {
		return (await navigator.storage.persisted()) ? 'persisted' : 'denied';
	} catch {
		return 'denied';
	}
}
