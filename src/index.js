import startsWith from 'core-js/library/fn/string/starts-with';
import {findDirWithFile} from './utils';
import * as fs from 'fs';
import * as path from 'path';

const MANIFEST_FILENAME = 'ippm.lock';

const moduleDir = path.dirname(module.filename);
const dir = findDirWithFile(moduleDir, MANIFEST_FILENAME);
if (!dir) {
	throw new Error(`unable to find the manifest ${MANIFEST_FILENAME} in ${moduleDir} or parents`);
}

const fileContent = fs.readFileSync(`${dir}/${MANIFEST_FILENAME}`, 'utf8');
const manifest = JSON.parse(fileContent);

const rootPackage = {
	path: dir,
};

const Module = module.constructor;
const origResolveFilename = Module._resolveFilename;
const natives = process.binding('natives');

function resolveFilename(request, parent) {
	if (request in natives) {
		return request;
	}

	if (startsWith(request, './') || startsWith(request, '..')) {
		return origResolveFilename(request, parent);
	}

	if (path.isAbsolute(request)) {
		return origResolveFilename(request, parent);
	}

	const reqParts = request.match(/^([^\/]*)(?:\/(.+))?$/);
	const reqId = reqParts[1];
	const reqPath = reqParts[2];

	return origResolveFilename(request, parent);
}

Module._resolveFilename = resolveFilename;
