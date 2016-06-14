import {constructor as System} from 'systemjs';
import * as jsonLoader from './system-plugins/json';
import startsWith from 'core-js/library/fn/string/virtual/starts-with';
import find from 'core-js/library/fn/array/virtual/find';
import {resolve as urlResolve} from 'url';

const IPPM_REGEX = /^([a-zA-Z0-9-_]+)(\/[^!]+)?(?:!.*)?$/;

export class IppmSystem extends System {
	_ippmModules = [];

	constructor() {
		super();

		this.config({
			defaultJSExtensions: true,
		});

		this.registerDynamic('json.js', [], false, () => jsonLoader);
	}

	async init(manifestPath = './ippm.lock') {
		const manifest = await this.import(`${manifestPath}!json`);
		this._manifest = manifest;

		const search = await this.normalize('');

		this._ippmModules.push(['', search.substr(0, search.length - 3)]);
	}

	async normalize(name, parentName, parentAddr) {
		console.log('normalize', name, parentName, parentAddr);

		const ippmMatch = name.match(IPPM_REGEX);
		const orig = super.normalize.bind(this, name, parentName, parentAddr);

		if (ippmMatch === null || this._manifest === undefined) return orig();

		console.log('ippmMatch', ...ippmMatch);

		const mani = this._manifest;
		const modu = this._ippmModules;

		const parModu = this._findParentModule(parentAddr);

		console.log('parModu', parModu);

		if (parModu === undefined || !(parModu[0] in mani.packages)) return orig();

		const deps = mani.packages[parModu[0]].dependencies;

		console.log('deps', deps);

		if (!(ippmMatch[1] in deps)) return orig();

		const nameVer = `${ippmMatch[1]}@${deps[ippmMatch[1]]}`;

		console.log('nameVer', nameVer);

		let ipfsUrl = `http://127.0.0.1:8081/ipfs/${mani.packages[nameVer].ipfs}/${nameVer}`;
		let search = await super.normalize(ipfsUrl, parentName, parentAddr);
		search = search.substr(0, search.length - 3);

		console.log('search', search);

		if (modu::find(e => e[0] === nameVer) === undefined) {
			modu.push([nameVer, search]);
		}

		if (ippmMatch[2] === undefined) {
			ipfsUrl = urlResolve(`${ipfsUrl}/`, mani.packages[nameVer].main);
		} else {
			ipfsUrl += ippmMatch[2];
		}

		if (ippmMatch[3] !== undefined) ipfsUrl += ippmMatch[3];

		return super.normalize(ipfsUrl, parentName, parentAddr);

		// if (this._manifest === undefined) throw new Error('IppmSystem not inited');
	}

	_findParentModule(parentAddr) {
		if (!parentAddr) parentAddr = ''; // eslint-disable-line no-param-reassign
		return this._ippmModules::find(m => parentAddr::startsWith(m[1]));
	}
}

export default new IppmSystem();
