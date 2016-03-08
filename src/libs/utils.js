import {readFile, access, R_OK} from 'js-utils-fs';
import * as path from 'path';

const objHasOwnProperty = Object.prototype.hasOwnProperty;

export function* objectValueIter() {
	for (const key in this) {
		if (this::objHasOwnProperty(key)) {
			yield this[key];
		}
	}
}

export function* objectKeyIter() {
	for (const key in this) {
		if (this::objHasOwnProperty(key)) {
			yield key;
		}
	}
}

export function* objectIter() {
	for (const key in this) {
		if (this::objHasOwnProperty(key)) {
			yield [key, this[key]];
		}
	}
}

export async function findDirWithFile(startDir, filename) {
	let dir = startDir;
	for (;;) {
		try {
			await access(`${dir}/${filename}`, R_OK);
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

export async function findManifestFile(dir) {
	const rootPackagePath = await findDirWithFile(dir, MANIFEST_FILENAME);
	if (!rootPackagePath) {
		throw new Error(`unable to find the manifest file "${MANIFEST_FILENAME}"`);
	}
	return rootPackagePath;
}

export async function readManifestFile(dir) {
	const fileContent = await readFile(`${dir}/${MANIFEST_FILENAME}`, 'utf8');
	const manifest = JSON.parse(fileContent);

	Object.keys(manifest.packages || {}).forEach(k => {
		manifest.packages[k].name = k;
		const pakInfo = manifest.packages[k];
		manifest.packages[k] = Object.assign({dependencies: {}, main: 'index.js'}, pakInfo);
	});

	return manifest;
}
