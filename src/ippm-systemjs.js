import {constructor as System} from 'systemjs';
import * as jsonLoader from './systemjs-plugins/json';
import startsWith from 'core-js/library/fn/string/virtual/starts-with';
import find from 'core-js/library/fn/array/virtual/find';
import {resolve as urlResolve} from 'url';

const IPPM_REGEX = /^([^!\/\.][^!\/]*)(?:\/([^!]+))?(?:!(.*))?$/;

export class IppmSystem extends System {
	_ippmPackages = [];

	constructor() {
		super();

		this.config({
			defaultJSExtensions: true,
		});

		this.registerDynamic('json.js', [], false, () => jsonLoader);
	}

	async init(manifestPath = './ippm.lock') {
		const manifest = await this.import(`${manifestPath}!json`);
		this._ippmManifest = manifest;

		const search = await this.normalize('');

		this._ippmPackages.push(['', search.substr(0, search.length - 3)]);
	}

	async normalize(name, parentName, skipExt) {
		const ippmMatch = name.match(IPPM_REGEX);
		const orig = super.normalize.bind(this, name, parentName, skipExt);

		const mani = this._ippmManifest;
		const packs = this._ippmPackages;
		if (ippmMatch === null || mani === undefined) return orig();

		const parentNameValidStr = parentName || '';
		const parPacks = this._ippmPackages::find(m => parentNameValidStr::startsWith(m[1]));
		if (parPacks === undefined || !(parPacks[0] in mani.packages)) return orig();

		const deps = mani.packages[parPacks[0]].dependencies;
		if (!(ippmMatch[1] in deps)) return orig();

		const nameVer = `${ippmMatch[1]}@${deps[ippmMatch[1]]}`;

		let ipfsUrl = `http://127.0.0.1:8081/ipfs/${mani.packages[nameVer].ipfs}/${nameVer}/`;

		const search = await super.normalize(ipfsUrl, parentName, skipExt);
		const searchWoExt = search.substr(0, search.length - 3);
		if (packs::find(e => e[0] === nameVer) === undefined) packs.push([nameVer, searchWoExt]);

		if (ippmMatch[2] === undefined) {
			ipfsUrl = urlResolve(ipfsUrl, mani.packages[nameVer].main);
		} else {
			ipfsUrl += ippmMatch[2];
		}

		if (ippmMatch[3] !== undefined) ipfsUrl += `!${ippmMatch[3]}`;

		return super.normalize(ipfsUrl, parentName, parentName);
	}
}

export default new IppmSystem();
