import {join as joinPath} from 'path';
import {readFile, writeFile} from 'js-utils-fs';
import _mkdirp from 'mkdirp';

const mkdirp = Promise.promisify(_mkdirp);

export class Persistent {
	_config = null;
	_configIsDirty = false;
	_path = null;
	_cache = {};

	async open(path) {
		if (this._config !== null) throw new Error('Persistent already open');

		if (path === undefined) {
			const home = process.platform === 'win32' ? process.env.USERPROFILE : process.env.HOME;
			if (!home) throw new Error('Home directory is not defined');
			// eslint-disable-next-line no-param-reassign
			path = joinPath(home, '.ippm');
		}
		this._path = path;

		// TODO: file locking
		return readFile(joinPath(this._path, 'config'), 'utf8')
			.then(content => JSON.parse(content))
			.catch(e => {
				if (e.code !== 'ENOENT') throw e;
				return {};
			})
			.then((config) => {
				this._config = config;
			});
	}

	async saveConfig() {
		if (!this._configIsDirty) return undefined;
		const content = JSON.stringify(this._config);
		return mkdirp(this._path)
			.then(() => writeFile(joinPath(this._path, 'config'), content, 'utf8'));
	}

	get(key) {
		return this._config[key];
	}

	set(key, value) {
		if (this._config[key] === value) return;
		this._configIsDirty = true;
		this._config[key] = value;
	}

	async getCache(name, version) {
		let contentP;
		if (name in this._cache) contentP = Promise.resolve(this._cache[name]);
		else {
			contentP = readFile(joinPath(this._path, 'cache', `${name}.json`), 'utf8')
				.then(content => JSON.parse(content))
				.catch(e => {
					if (e.code !== 'ENOENT') throw e;
					return {};
				});
		}

		return contentP.then(cached => (version !== undefined ? cached[version] : cached));
	}

	async putCache(name, version, ipfsId) {
		return this.getCache(name).then((content) => {
			if (version in content) return undefined;
			// eslint-disable-next-line no-param-reassign
			content[version] = ipfsId;
			const dir = joinPath(this._path, 'cache');
			return mkdirp(dir).then(() => {
				this._cache[name] = content;
				return writeFile(joinPath(dir, `${name}.json`), JSON.stringify(content), 'utf8');
			});
		});
	}
}

export default new Persistent();
