import startsWith from 'core-js/library/fn/string/virtual/starts-with';
import find from 'core-js/library/fn/array/virtual/find';
import {findIppmFile, readLockFile} from './libs/utils';
import Store from './ippm-node/store';
import * as path from 'path';
import {promise as deasync} from 'deasync';
import {request as httpRequest} from 'http';
import * as fs from 'fs';

const Module = module.constructor;

const origResolveFilename = Module._resolveFilename;
const origLoad = Module.load;
const natives = process.binding('natives');
let manifest;
let store;

const extensions = {
	'.js'(module, filename, content) {
		module._compile(content, filename);
	},

	'.json'(module, filename, content) {
		try {
			// eslint-disable-next-line no-param-reassign
			module.exports = JSON.parse(content);
		} catch (err) {
			err.message = `${filename}: ${err.message}`;
			throw err;
		}
	},
};

const origExtensions = Object.assign({}, Module._extensions);

async function main() {
	const pakPath = await findIppmFile(path.dirname(module.parent.filename));
	manifest = await readLockFile(pakPath);

	store = new Store({
		path: pakPath,
	});
}

deasync(main)();

function resolveFilename(request, parent) {
	if (request in natives) return request;

	const parentPackage = store.getByFilePath(parent.filename);
	const isRelative = request::startsWith('./') || request::startsWith('../');

	const redirectToOrig =
		!parentPackage // no parent ippm package found
		|| isRelative && parentPackage.name === ''
		|| path.isAbsolute(request);

	if (redirectToOrig) return origResolveFilename(request, parent);

	let reqPathNorm;

	if (isRelative) {
		reqPathNorm = path.resolve(path.dirname(parent.filename), request);
	} else {
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
			pakPath = `/ipfs/${pakInfo.ipfs}/${pakInfo.name}`;

			store.add({
				name: pakName,
				path: pakPath,
			});
		}

		reqPathNorm = `${pakPath}/${path.normalize(reqPath || pakInfo.main)}`;
	}

	return reqPathNorm;
}

function load(filename) {
	const isIpfs = filename::startsWith('/ipfs/');

	const filenameVars = [
		`${filename}.js`,
		`${filename}/index.js`,
		`${filename}`,
	];

	let content;
	if (isIpfs) {
		content = deasync(async () => {
			const variants = filenameVars.map(filenameVar =>
				[
					filenameVar,
					new Promise((resolve, reject) => {
						let buf = '';
						const req = httpRequest(
							{
								path: filenameVar,
								host: '127.0.0.1',
								port: 8081,
							},
							res => {
								if (res.statusCode !== 200) {
									reject(new Error(`http status ${res.statusCode} at ${filename}`));
								}
								res.setEncoding('utf8');
								res.on('data', chunk => {
									buf += chunk;
								});
								res.on('end', () => resolve(buf));
							}
						);

						req.on('error', reject);
						req.end();
					}),
				]
			);

			for (const v of variants) {
				try {
					const c = await v[1];
					// eslint-disable-next-line no-param-reassign
					filename = v[0];
					return c;
				} catch (_) {} // eslint-disable-line no-empty
			}

			throw new Error(`unable to find file for ${filename}`);
		})();
	} else {
		const filenameVar = filenameVars::find(v => {
			try {
				fs.accessSync(v, fs.F_OK);
				return true;
			} catch (_) {
				return false;
			}
		});

		if (filenameVar === undefined) {
			throw new Error(`unable to find file for ${filename}`);
		}

		// eslint-disable-next-line no-param-reassign
		filename = filenameVar;

		content = fs.readFileSync(filenameVar, 'utf8');
	}

	this.filename = filename;
	this.paths = isIpfs ? [] : Module._nodeModulePaths(path.dirname(filename));

	const extension = path.extname(filename);
	if (!Module._extensions[extension]) {
		throw new Error(`unknown extension "${extension}" in ${filename}`);
	}

	Module._extensions[extension](this, filename, content);
	this.loaded = true;
}

export function patch() {
	Module._resolveFilename = resolveFilename;
	Module.prototype.load = load;

	Object.assign(Module._extensions, extensions);
}

export function unpatch() {
	Module._resolveFilename = origResolveFilename;
	Module.prototype.load = origLoad;
	Object.assign(Module._extensions, origExtensions);
}
