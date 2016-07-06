import parsePackageArg from 'npm-package-arg';
import {maxSatisfying} from 'semver';
import normalizeRegData from 'normalize-registry-metadata';
import normalizePakData from 'normalize-package-data';
import {contains, qw} from 'js-utils';
import {get as httpGet} from './http';
import registryUrl from 'registry-url';
import persistent from './persistent';
import {add as ipfsAdd} from './ipfs';

const metaCache = Object.create(null);

export async function add(pakRaw) {
	const pak = parsePackageArg(pakRaw);
	if (!qw('range tag version')::contains(pak.type)) {
		throw new Error(`Unsupported package argument type for package "${pakRaw}"`);
	}
	let meta;
	if (pak.name in metaCache) {
		meta = metaCache[pak.name];
	} else {
		const res = await httpGet(`${registryUrl(pak.scope)}${pak.escapedName}`);
		if (res.response.statusCode !== 200) {
			throw new Error(
				`Could not load metadata for "${pakRaw}" (http status code: ${res.response.statusCode})`
			);
		}
		meta = JSON.parse(res.body);
		if (!normalizeRegData(meta)) throw new Error(`Invalid npm metadata for package "${pakRaw}"`);
		if (!meta.versions) throw new Error(`Package "${pak.name}" has no versions`);
		metaCache[pak.name] = meta;
	}
	let version;
	if (pak.type === 'tag') {
		if (!(pak.spec in meta['dist-tags'])) {
			throw new Error(`Could not find tag "${pak.spec}" for package "${pak.name}"`);
		}
		version = meta['dist-tags'][pak.spec];
	} else {
		version = maxSatisfying(Object.keys(meta.versions), pak.spec);
	}
	const versionMeta = meta.versions[version];
	if (!versionMeta) {
		throw new Error(`Could not find a satisfying version for package "${pakRaw}"`);
	}
	let ipfsId = await persistent.getCache(pak.name, version);
	if (!ipfsId) {
		ipfsId = await ipfsAdd(versionMeta);
		persistent.putCache(pak.name, version, ipfsId);
	}
	normalizePakData(versionMeta);
	return {
		ipfs: ipfsId,
		meta: versionMeta,
	};
}
