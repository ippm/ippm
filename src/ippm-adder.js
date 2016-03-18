/* eslint-disable no-console, no-loop-func */
import {
	toAsync,
	asyncMain,
	callNodeAsync as cAsync,
	fs,
} from 'js-utils';
import {get as httpGet} from 'http';
import {Connection as DBConn} from 'cradle';
import {extract as tarExtract} from 'tar-fs';
import gunzipMaybe from 'gunzip-maybe';
import digestStream from 'digest-stream';
import del from 'del';
import ipfsApi from 'ipfs-api';
import crypto from 'crypto';
import _mkdirp from 'mkdirp';
import semver from 'semver';
import RWLock from 'rwlock';
import pump from 'pump';

const REPO_LOCK = new RWLock();

const mkdirp = toAsync(_mkdirp);

const ipfs = ipfsApi({host: 'localhost', port: '5001', procotol: 'http'});
// const db = new DBConn('http://couchdb', 5984).database('npm');
const db = new DBConn('http://127.0.0.1', 5984, {}).database('npm');
const dataPath = './ws';
const tmpPath = '/tmp/ippm-adder';

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

	const releaseLock = await new Promise(resolve => REPO_LOCK.writeLock(resolve));
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

	const releaseLock = await new Promise(resolve => REPO_LOCK.readLock(resolve));
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

	const pakPath = `${tmpPath}/${pak.nameVer}`;

	await del(pakPath, {force: true});

	try {
		const tarRes = await new Promise(resolve => httpGet(pak.tarUrl, resolve));

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

		await cAsync(pump,
			tarRes,
			digestStream('sha1', 'hex', shasum =>
				pak.shasum !== shasum ? new Error(`shasum mismatch "${pak.tarUrl}"`) : undefined
			),
			gunzipMaybe(),
			tarExtract(pakPath, {
				dmode: 0o555,
				fmode: 0o444,
				map(header) {
					// replace 'package/' with `${nameVer}/`;
					// eslint-disable-next-line no-param-reassign
					header.name = `${pak.nameVer}/${header.name.substring(8)}`;
					return header;
				},
				ignore(_, header) {
					return header.type !== 'directory' && header.type !== 'file';
				},
			})
		);

		const ipfsRes = await ipfs.add(pakPath, {recursive: true});
		const ipfsId = ipfsRes[ipfsRes.length - 1].Hash;

		await writePakId(pak, ipfsId);

		return ipfsId;
	} finally {
		await del(pakPath, {force: true});
	}
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
			await del(tmpPath, {force: true});

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
					if (5 <= chunks[chunks.length - 1].length) chunks.push([]);

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
