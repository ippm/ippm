import {constructor as System} from 'systemjs';
import * as jsonLoader from './systemjs-plugins/json';
import startsWith from 'core-js/library/fn/string/virtual/starts-with';
import find from 'core-js/library/fn/array/virtual/find';
import {resolve as urlResolve} from 'url';

global.Promise = Promise;

const NAME_REGEX = /^([^!\/\.][^!\/]*)(?:\/([^!]+))?$/;

export class IppmSystem extends System {
	_ippmPackages = [];

	constructor() {
		super();

		this.config({
			defaultJSExtensions: true,
			meta: {
				'*.json': {
					loader: 'json.js',
				},
			},
		});

		this.registerDynamic('json.js', [], false, () => jsonLoader);
	}

	async init(manifestPath = './ippm.lock') {
		const manifest = await this.import(`${manifestPath}!json`);
		this._ippmManifest = manifest;

		const search = await super.normalize('');
		this._ippmPackages.push(['', search.substr(0, search.length - 3)]);
	}

	config(cfg, ...args) {
		this._ippmConfig = Object.assign(
			{
				baseURL: 'https://ipfs.io/ipfs/',
			},
			cfg.ippm
		);

		return super.config(cfg, ...args);
	}

	async normalize(name, parentName, skipExt) {
		const nameMatch = name.match(NAME_REGEX);
		const orig = super.normalize.bind(this, name, parentName, skipExt);

		const mani = this._ippmManifest;
		const packs = this._ippmPackages;
		if (nameMatch === null || mani === undefined) return orig();

		const parentNameValidStr = parentName || '';
		const parentPack = packs::find(m => parentNameValidStr::startsWith(m[1]));
		if (parentPack === undefined || !(parentPack[0] in mani.packages)) return orig();

		const deps = mani.packages[parentPack[0]].dependencies;
		if (!(nameMatch[1] in deps)) return orig();

		const nameVer = `${nameMatch[1]}@${deps[nameMatch[1]]}`;

		let ipfsUrl = `${this._ippmConfig.baseURL}${mani.packages[nameVer].ipfs}/${nameVer}/`;

		const search = await super.normalize(ipfsUrl, parentName, skipExt);
		if (packs::find(e => e[0] === nameVer) === undefined) {
			packs.push([nameVer, search.substr(0, search.length - 3)]);
		}

		if (nameMatch[2] === undefined) {
			ipfsUrl = urlResolve(ipfsUrl, mani.packages[nameVer].main);
		} else {
			ipfsUrl += nameMatch[2];
		}

		return super.normalize(ipfsUrl, parentName, skipExt);
	}
}

export default new IppmSystem();
