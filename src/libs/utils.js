import {readFile, writeFile, access, R_OK} from 'js-utils-fs';
import * as path from 'path';

const objHasOwnProperty = Object.prototype.hasOwnProperty;

export function* objectValueIter() {
	for (const key in this) {
		if (!this::objHasOwnProperty(key)) continue;

		yield this[key];
	}
}

export function* objectKeyIter() {
	for (const key in this) {
		if (!this::objHasOwnProperty(key)) continue;

		yield key;
	}
}

export function* objectIter() {
	for (const key in this) {
		if (!this::objHasOwnProperty(key)) continue;

		yield [key, this[key]];
	}
}

export async function findDirWithFile(startDir, filename) {
	let dir = startDir;
	for (;;) {
		try {
			await access(`${dir}/${filename}`, R_OK);
		} catch (e) {
			if (e.code !== 'ENOENT') throw e;

			const prevDir = dir;
			dir = path.dirname(dir);

			if (dir === prevDir) return null;

			continue;
		}

		return dir;
	}
}

export const IPPM_FILENAME = 'ippm.json';
export const IPPM_LOCK_FILENAME = 'ippm.lock';

export async function findIppmFile(dir) {
	const rootPackagePath = await findDirWithFile(dir, IPPM_FILENAME);
	if (!rootPackagePath) throw new Error(`unable to find the lock file "${IPPM_FILENAME}"`);
	return rootPackagePath;
}

export async function readLockFile(dir) {
	const fileContent = await readFile(`${dir}/${IPPM_LOCK_FILENAME}`, 'utf8');
	const lock = JSON.parse(fileContent);

	Object.keys(lock.packages || {}).forEach(k => {
		const pakInfo = lock.packages[k];
		lock.packages[k] = Object.assign({dependencies: {}, main: 'index.js'}, pakInfo);
	});

	return lock;
}

export async function writeLockFile(dir, lock) {
	const content = JSON.stringify(lock, undefined, '\t');
	return writeFile(`${dir}/${IPPM_LOCK_FILENAME}`, `${content}\n`, 'utf8');
}

export async function readIppmFile(dir) {
	return readFile(`${dir}/${IPPM_FILENAME}`, 'utf8').then(JSON.parse);
}

export async function writeIppmFile(dir, ippm) {
	const content = JSON.stringify(ippm, undefined, '\t');
	return writeFile(`${dir}/${IPPM_FILENAME}`, `${content}\n`, 'utf8');
}

export function getAllReachableDepNamesInLock(lock) {
	const paks = lock.packages;
	const reachedDeps = Object.create(null);
	function visitPak(pakName) {
		if (pakName !== '') reachedDeps[pakName] = true;
		const deps = paks[pakName].dependencies;
		Object.keys(deps).forEach(name => {
			if (!(name in reachedDeps)) visitPak(`${name}@${deps[name]}`);
		});
	}
	visitPak('');
	return reachedDeps;
}

export function gcLock(lock) {
	const paks = lock.packages;
	const reachableDeps = getAllReachableDepNamesInLock(lock);
	const newPaks = Object.create(null);
	Object.keys(paks).forEach(pakName => {
		if (pakName === '' || pakName in reachableDeps) newPaks[pakName] = paks[pakName];
	});
	const newLock = Object.assign({}, lock);
	newLock.packages = newPaks;
	return newLock;
}
