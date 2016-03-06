import * as fs from 'fs';
import * as path from 'path';

export function objectValues() {
	return Object.keys(this).map(k => this[k]);
}

export function objectIter() {
	return Object.keys(this).map(k => [k, this[k]]);
}

export function findDirWithFile(startDir, filename) {
	let dir = startDir;
	for (;;) {
		try {
			fs.accessSync(`${dir}/${filename}`, fs.R_OK);
		} catch (e) {
			if (!('code' in e) || e.code !== 'ENOENT') {
				throw e;
			}

			const prevDir = dir;
			dir = path.dirname(dir);
			if (dir === prevDir) {
				return null;
			}

			continue;
		}

		return dir;
	}
}
export const MANIFEST_FILENAME = 'ippm.lock';

export function findManifestFile(dir) {
	const rootPackagePath = findDirWithFile(dir, MANIFEST_FILENAME);
	if (!rootPackagePath) {
		throw new Error(`unable to find the manifest file "${MANIFEST_FILENAME}"`);
	}
	return rootPackagePath;
}

export function readManifestFile(dir) {
	const fileContent = fs.readFileSync(`${dir}/${MANIFEST_FILENAME}`, 'utf8');
	const manifest = JSON.parse(fileContent);

	Object.keys(manifest.packages || {}).forEach(k => {
		manifest.packages[k].name = k;
		const pakInfo = manifest.packages[k];
		manifest.packages[k] = Object.assign({dependencies: {}, main: 'index.js'}, pakInfo);
	});

	return manifest;
}
