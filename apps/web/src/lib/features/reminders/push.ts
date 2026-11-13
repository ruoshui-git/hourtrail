export const emptyResponseSchema = {
	parse(value: unknown): undefined {
		if (value !== undefined) throw new TypeError('Expected an empty response.');
		return undefined;
	},
};
