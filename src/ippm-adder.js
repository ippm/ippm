/* eslint-disable no-console, no-loop-func */
import {
	toAsync,
	asyncMain,
	Lock,
	callNodeAsync as cAsync,
	sleep,
} from 'js-utils';
import * as fs from 'js-utils-fs';
import {get as httpGet} from 'http';
import {Feed as CouchDBFeed} from 'follow';
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
import find from 'core-js/library/fn/array/virtual/find';
import Vinyl from 'vinyl';
import * as path from 'path';
import {toB58String} from 'multihashes';
import through2 from 'through2';
import to2 from 'to2';

const REPO_LOCK = new Lock();

const mkdirp = toAsync(_mkdirp);

const ipfs = ipfsApi({host: 'localhost', port: '5001', procotol: 'http'});
const dataPath = './ws';
let ipfsWorkDur = 0;

async function retry(fn) {
	for (let attempt = 1; ; attempt += 1) {
		try {
			return await fn();
		} catch (e) {
			if (attempt <= 3) {
				sleep(10000);
				continue;
			} else throw e;
		}
	}
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

const errorLogStream = fs.createWriteStream(`${dataPath}/errorlog`, {flags: 'a'});
function logException(pak, exception) {
	console.log(` ### ${pak.nameVer}: ${exception}`);
	return errorLogStream::cAsync(
		'write',
		`${pak.nameVer} exception: ${exception}\n${pak.nameVer}: skipped\n`,
		'utf-8'
	);
}

const addLogStream = fs.createWriteStream(`${dataPath}/addlog`, {flags: 'a'});
function logAdd(pak, ipfsId) {
	console.log(` + ${pak.nameVer}: ${ipfsId}`);
	const logString = JSON.stringify({name: pak.nameVer, ipfs: ipfsId});
	return addLogStream::cAsync('write', `${logString}\n`, 'utf-8');
}

asyncMain(async () => {
	await mkdirp(dataPath);

	const exitHandler = () => {
		// TODO: exit
	};
	process.on('SIGINT', exitHandler);
	process.on('SIGTERM', exitHandler);

	let since = 0;
	try {
		since = Number.parseInt(await fs.readFile(`${dataPath}/seq`, 'utf-8'), 10);
	} catch (_) {
		// ignore exception
	}

	await cAsync(pump,
		new CouchDBFeed({
			db: 'https://skimdb.npmjs.com/registry',
			since,
		}),
		through2.obj(function $mapChangeToPaks(change, _, cb) {
			const promises = Object.keys(change.doc.versions).map(dirtyVersion => {
				const meta = change.doc.versions[dirtyVersion];
				const version = semver.clean(dirtyVersion, true);
				const pak = {
					name: meta.name,
					version,
					nameVer: `${meta.name}@${version}`,
					shasum: meta.dist.shasum,
					tarUrl: meta.dist.tarball,
					seq: change.seq,
				};

				return versionExists(pak).then(exists => {
					if (!exists) this.push(pak);
				});
			});

			Promise.all(promises).then(() => cb(), e => cb(e));
		}),
		through2.obj(function $downloadFilesFromNpm(pak, _, cb) {
			retry(async () => {
				const tarRes = await new Promise((resolve, reject) =>
					httpGet(pak.tarUrl, resolve).on('error', reject)
				);

				if (tarRes.statusCode !== 200) {
					if (tarRes.headers['content-type'] === 'application/json') {
						await new Promise((_1, reject) => {
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
					digestStream('sha1', 'hex', shasum => (
						pak.shasum !== shasum ? new Error(`shasum mismatch "${pak.tarUrl}"`) : undefined
					)),
					gunzipMaybe(),
					tarExtract(),
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
						const dirnameEscaped = dirname.replace(/[\\']/g, '\\$&');
						const contents = new Buffer(
							`module.exports = require('./${dirnameEscaped}/index.js');\n`
						);

						this.push(new Vinyl({
							path: path.resolve(v.dirname, `../${dirname}.js`),
							contents,
						}));
					}),
					streamFilter.obj(v => {
						files.push({
							path: v.relative,
							content: v.contents,
						});
						return false;
					})
				);
			})
				.then(files => {
					this.push({
						pak,
						files,
					});
				})
				.then(() => cb(), e => logException(pak, e));
		}),
		to2.obj(({pak, files}, _, cb) => { // adds files to ipfs
			retry(async () => {
				let ipfsRes;
				const startTime = Date.now();
				try {
					ipfsRes = await ipfs.files.add(files, {recursive: true});
				} finally {
					ipfsWorkDur += Date.now() - startTime;
				}
				const rootNode = ipfsRes::find(r => r.path === 'root');
				if (rootNode === undefined) {
					throw new Error('Could not find "root" ipfs-node');
				}
				const ipfsId = toB58String(rootNode.node.multihash());

				await writePakId(pak, ipfsId);
				await logAdd(pak, ipfsId);
			})
				.then(() => fs.writeFile(`${dataPath}/seq`, `${pak.seq.toString(10)}\n`, 'utf-8'))
				.then(() => cb(), e => logException(pak, e));
		})
	);
});
