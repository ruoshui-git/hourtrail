/**
 * Opening the session editor from any screen (Home, History, Review).
 * Contract owned by the orchestrator; task 1.6 implements SessionEditorHost.
 */
export type NewSessionPrefill = {
	/** Epoch ms; e.g. a gap's bounds from History. */
	start_at?: number;
	end_at?: number;
	work_item_id?: string | null;
};

export type EditorRequest =
	{ mode: 'edit'; sessionId: string; focus?: 'note' } | { mode: 'new'; prefill: NewSessionPrefill };

let request = $state<EditorRequest | null>(null);

export const sessionEditor = {
	get request(): EditorRequest | null {
		return request;
	},
	close(): void {
		request = null;
	},
};

/** Open an existing session; `focus: 'note'` puts the cursor in the note (after Stop's "Add note"). */
export function openSessionEditor(sessionId: string, opts: { focus?: 'note' } = {}): void {
	request = { mode: 'edit', sessionId, ...opts };
}

/** Open the editor for a manual (historical) entry. */
export function openNewSession(prefill: NewSessionPrefill = {}): void {
	request = { mode: 'new', prefill };
}
