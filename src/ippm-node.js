import startsWith from 'core-js/library/fn/string/virtual/starts-with';
import {getIpfsPathByPackageInfo} from './ippm-node/utils';
import {findManifestFile, readManifestFile} from './libs/utils';
import Store from './ippm-node/store';
import {statSync} from 'fs';
import * as path from 'path';
import {promise as deasync} from 'deasync';

const origResolveFilename = module.constructor._resolveFilename;
const natives = process.binding('natives');
let manifest;
let store;

async function main() {
	const pakPath = await findManifestFile(path.dirname(module.parent.filename));
	manifest = await readManifestFile(pakPath);

	store = new Store({
		path: pakPath,
	});
}

deasync(main)();

function resolveFilename(request, parent) {
	if (request in natives) return request;

	const parentPackage = store.getByFilePath(parent.filename);

	const redirectToOrig =
		!parentPackage // no parent ippm package found
		|| request::startsWith('./') || request::startsWith('..') // local relative
		|| path.isAbsolute(request); // absolute

	if (redirectToOrig) return origResolveFilename(request, parent);

	const reqParts = request.match(/^([^\/]*)(?:\/(.+))?$/);
	const reqId = reqParts[1];
	const reqPath = reqParts[2];

	const deps = manifest.packages[parentPackage.name].dependencies;
	const pakName = `${reqId}@${deps[reqId]}`;

	const pak = store.getByName(pakName);
	const pakInfo = manifest.packages[pakName];

	let pakPath;

	if (pak) {
		pakPath = pak.path;
	} else {
		pakPath = getIpfsPathByPackageInfo(pakInfo);

		store.add({
			name: pakName,
			path: pakPath,
		});
	}

	let reqPathNorm = path.join(pakPath, reqPath || pakInfo.main);

	try {
		if (statSync(reqPathNorm).isDirectory()) reqPathNorm = path.join(reqPathNorm, 'index.js');
	} catch (e) {
		if (e.code !== 'ENOENT') throw e;
	}

	if (path.extname(reqPathNorm).length === 0) {
		reqPathNorm += '.js';
	}

	console.log(reqPathNorm);

	return reqPathNorm;
}

export function patch() {
	module.constructor._resolveFilename = resolveFilename;
}

export function unpatch() {
	module.constructor._resolveFilename = origResolveFilename;
}
