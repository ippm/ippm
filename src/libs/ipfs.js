import {callNodeAsync} from 'js-utils';
import ipfsApi from 'ipfs-api';
import {getStream as httpGetStream} from './http';
import pump from 'pump';
import digestStream from 'digest-stream';
import gunzipMaybe from 'gunzip-maybe';
import {extract as tarExtract} from 'tar-vinyl-stream';
import streamFilter from 'through2-filter';
import gulpRename from 'gulp-rename';
import streamSpy from 'through2-spy';
import * as path from 'path';
import Vinyl from 'vinyl';
import {toB58String} from 'multihashes';
import endsWith from 'core-js/library/fn/string/virtual/ends-with';
import find from 'core-js/library/fn/array/virtual/find';

export const ipfs = ipfsApi({host: '127.0.0.1', port: '5001', procotol: 'http'});

export async function add(meta) {
	const nameVer = `${meta.name}@${meta.version}`;
	const res = await httpGetStream(meta.dist.tarball);
	if (res.statusCode !== 200) {
		res.setEncoding('utf8');
		await new Promise((_1, reject) => {
			let msgData = '';
			res
				.on('error', reject)
				.on('data', chunk => {
					msgData += chunk;
				})
				.on('end', () => {
					if (res.headers['content-type'] === 'application/json') {
						const msg = JSON.parse(msgData);
						reject(new Error(`${meta.dist.tarball}: ${msg.error || res.statusMessage}`));
					} else {
						reject(new Error(`${meta.dist.tarball}: ${res.statusMessage}`));
					}
				});
		});
	}

	const files = [];
	await callNodeAsync(pump,
		res,
		digestStream('sha1', 'hex', shasum => {
			if (meta.dist.shasum === shasum) return undefined;
			return new Error(`shasum mismatch "${meta.dist.tarball}"`);
		}),
		gunzipMaybe(),
		tarExtract(),
		streamFilter.obj(f => f.tarHeader.type === 'file'),
		gulpRename(f => {
			// eslint-disable-next-line no-param-reassign
			f.dirname = `root/${nameVer}/${f.dirname.substring(8)}`;
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

	const ipfsRes = await ipfs.files.add(files);
	const rootNode = ipfsRes::find(r => r.path === 'root');
	if (rootNode === undefined) {
		throw new Error(`Could not find "root" ipfs-node for "${nameVer}"`);
	}
	return toB58String(rootNode.node.multihash());
}
