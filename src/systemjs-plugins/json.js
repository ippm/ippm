export function translate(load) {
	if (!this.builder) return undefined;

	// eslint-disable-next-line no-param-reassign
	load.metadata.format = 'cjs';
	return `module.exports = ${JSON.stringify(JSON.parse(load.source))}`;
}

export function instantiate(load) {
	if (this.builder) return undefined;

	return JSON.parse(load.source);
}
