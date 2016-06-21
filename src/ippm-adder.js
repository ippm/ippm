/* eslint-disable no-console, no-loop-func */
import {
	toAsync,
	asyncMain,
	Lock,
	callNodeAsync as cAsync,
} from 'js-utils';
import * as fs from 'js-utils-fs';
import {get as httpGet} from 'http';
import {Connection as DBConn} from 'cradle';
import {extract as tarExtract} from 'tar-vinyl-stream';
import gunzipMaybe from 'gunzip-maybe';
import digestStream from 'digest-stream';
import ipfsApi from 'ipfs-api';
import crypto from 'crypto';
import _mkdirp from 'mkdirp';
import semver from 'semver';
import pump from 'pump';
import gulpRename from 'gulp-rename';
import streamFilter from 'through2-filter';
import streamSpy from 'through2-spy';
import endsWith from 'core-js/library/fn/string/virtual/ends-with';
import Vinyl from 'vinyl';
import * as path from 'path';
import {toB58String} from 'multihashes';

const REPO_LOCK = new Lock();
const IPFS_LOCK = new Lock();

const mkdirp = toAsync(_mkdirp);

const ipfs = ipfsApi({host: 'localhost', port: '5001', procotol: 'http'});
const db = new DBConn('https://skimdb.npmjs.com', 443, {}).database('registry');
const dataPath = './ws';

async function readState() {
	try {
		return JSON.parse(await fs.readFile(`${dataPath}/state.json`, 'utf-8'));
	} catch (e) {
		if (e.code !== 'ENOENT') throw e;
	}

	return {last_seq: 0, failedQueue: []};
}

function writeState(state) {
	return fs.writeFile(`${dataPath}/state.json`, JSON.stringify(state), 'utf-8');
}

async function writePakId({name, version}, ipfsId) {
	const nH = crypto.createHash('md5').update(name).digest('hex');
	const dirPath = `${dataPath}/repo/${nH[0]}/${nH[1]}/${nH[2]}`;
	const filePath = `${dirPath}/${name}.json`;

	const releaseLock = await REPO_LOCK.lock();
	try {
		await mkdirp(dirPath);

		let content = {versions: []};
		try {
			content = JSON.parse(await fs.readFile(filePath, 'utf-8'));
		} catch (e) {
			if (e.code !== 'ENOENT') throw e;
		}

		content.versions.push({version, ipfs: ipfsId});

		content.versions = content.versions
			.filter((e1, i, arr) => i === arr.findIndex(e2 => e1.version === e2.version))
			.sort((a, b) => semver.compare(a.version, b.version));

		await fs.writeFile(filePath, JSON.stringify(content, undefined, '  '), 'utf-8');
	} finally {
		releaseLock();
	}
}

async function versionExists({name, version}) {
	const nH = crypto.createHash('md5').update(name).digest('hex');
	const filePath = `${dataPath}/repo/${nH[0]}/${nH[1]}/${nH[2]}/${name}.json`;

	const releaseLock = await REPO_LOCK.lock();
	try {
		const content = JSON.parse(await fs.readFile(filePath, 'utf-8'));
		return content.versions.some(e => e.version === version);
	} catch (e) {
		if (e.code === 'ENOENT') return false;

		throw e;
	} finally {
		releaseLock();
	}
}

async function processPackage(pak) {
	if (await versionExists(pak)) return undefined;

	const tarRes = await new Promise((resolve, reject) =>
		httpGet(pak.tarUrl, resolve).on('error', reject)
	);

	if (tarRes.statusCode !== 200) {
		if (tarRes.headers['content-type'] === 'application/json') {
			await new Promise((_, reject) => {
				let msgData = '';
				tarRes
					.on('error', reject)
					.on('data', chunk => {
						msgData += chunk;
					})
					.on('end', () => {
						const msg = JSON.parse(msgData);
						reject(new Error(`${msg.error || tarRes.statusMessage} "${pak.tarUrl}"`));
					});
			});
		} else {
			tarRes.abort();
			throw new Error(`${tarRes.statusMessage} "${pak.tarUrl}"`);
		}
	}


	const files = [];
	await cAsync(pump,
		tarRes,
		digestStream('sha1', 'hex', shasum =>
			pak.shasum !== shasum ? new Error(`shasum mismatch "${pak.tarUrl}"`) : undefined
		),
		gunzipMaybe(),
		tarExtract({buffer: true}),
		streamFilter.obj(f => f.tarHeader.type === 'file'),
		gulpRename(f => {
			// eslint-disable-next-line no-param-reassign
			f.dirname = `root/${pak.nameVer}/${f.dirname.substring(8)}`;
		}),
		// eslint-disable-next-line func-names
		streamSpy.obj(function (v) {
			if (!v.path::endsWith('/index.js')) return;

			const parentDirname = v.dirname;
			const dirname = path.relative(path.dirname(parentDirname), parentDirname);
			const contents = new Buffer(`exports = require('./${dirname}/index.js');\n`);

			this.push(new Vinyl({
				path: path.resolve(v.dirname, `../${dirname}.js`),
				contents,
			}));
		}),
		streamSpy.obj(v => files.push({
			path: v.relative,
			content: v.contents,
		})),
		streamFilter.obj(() => false) // eat all files
	);

	const releaseLock = await IPFS_LOCK.lock();
	let ipfsId;
	try {
		const ipfsRes = await ipfs.files.add(files, {recursive: true});
		ipfsId = toB58String(ipfsRes[ipfsRes.length - 1].node.multihash());
	} finally {
		releaseLock();
	}

	await writePakId(pak, ipfsId);

	return ipfsId;
}

asyncMain(async () => {
	const state = await readState();
	await mkdirp(dataPath);

	const errorLogStream = fs.createWriteStream(`${dataPath}/errorlog`, {flags: 'a'});
	function logError(msg) {
		console.log(` ### ${msg}`);
		return errorLogStream::cAsync('write', `${msg}\n`, 'utf-8');
	}

	const addLogStream = fs.createWriteStream(`${dataPath}/addlog`, {flags: 'a'});
	function logAdd(pak, ipfsId) {
		console.log(` + ${pak.nameVer}: ${ipfsId}`);
		const logString = JSON.stringify({name: pak.nameVer, ipfs: ipfsId});
		return addLogStream::cAsync('write', `${logString}\n`, 'utf-8');
	}

	let dbFails = 0;

	for (;;) {
		try {
			let changes;
			try {
				changes = await db::cAsync('changes', {
					since: state.last_seq,
					feed: 'longpoll',
					limit: 10,
					include_docs: true,
				});

				dbFails = 0;
			} catch (e) {
				dbFails += 1;

				if (dbFails < 10) {
					console.log(e);
					continue;
				}

				throw e;
			}

			const changedPackages = changes
				.reduce(
					(vers, row) => vers.concat(
						Object.keys(row.doc.versions).map(k => row.doc.versions[k])
					),
					[]
				)
				.map(pak => {
					const version = semver.clean(pak.version, true);
					return {
						name: pak.name,
						version,
						nameVer: `${pak.name}@${version}`,
						shasum: pak.dist.shasum,
						tarUrl: pak.dist.tarball,
						numberFails: 0,
					};
				})
				.concat(state.failedQueue)
				.reduce((chunks, pak) => {
					if (10 <= chunks[chunks.length - 1].length) chunks.push([]);

					chunks[chunks.length - 1].push(pak);
					return chunks;
				}, [[]]);

			state.failedQueue = [];

			for (const changedPackagesChunk of changedPackages) {
				// eslint-disable-next-line array-callback-return
				await Promise.all(changedPackagesChunk.map(async (pak) => {
					try {
						const ipfsId = await processPackage(pak);
						if (ipfsId) await logAdd(pak, ipfsId);
					} catch (e) {
						// eslint-disable-next-line no-param-reassign
						pak.numberFails += 1;

						await logError(`${pak.nameVer}: exception (#${pak.numberFails}): ${e}`);

						if (pak.numberFails < 10) state.failedQueue.push(pak);
						else await logError(`${pak.nameVer}: skipped`);
					}
				}));
			}

			state.last_seq = changes.last_seq;
		} finally {
			await writeState(state);
		}
	}
});
