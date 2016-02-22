const Module = module.constructor;
const origResolveFilename = Module._resolveFilename;

export function patch(resolveFilename) {
	Module._resolveFilename = resolveFilename;
}

export function unpatch() {
	Module._resolveFilename = origResolveFilename;
}
