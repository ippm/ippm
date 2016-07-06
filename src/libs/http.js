import http from 'http';
import https from 'https';
import {parse as parseUrl} from 'url';
import {isObject} from 'js-utils';

function defaultOptions(_options) {
	const options = Object.assign({
		encoding: 'utf8',
	}, _options);
	if (!options.encoding) options.encoding = 'buffer';
	return options;
}

export function getStream(url, _options) {
	return new Promise(resolve => {
		const options = defaultOptions(_options);
		const parsedUrl = parseUrl(url);
		if (options.httpOptions::isObject()) Object.assign(parsedUrl, options.httpOptions);
		const req = (parsedUrl.protocol === 'http:' ? http : https).request(parsedUrl);
		req.once('response', resolve);
		req.end();
	});
}

export function get(url, _options) {
	const options = defaultOptions(_options);

	return getStream(url, options).then(res => new Promise((resolve, reject) => {
		res.setEncoding(options.encoding === 'buffer' ? null : options.encoding);
		res.once('error', reject);

		let buf = options.encoding === 'buffer' ? [] : '';
		res.on('data', chunk => {
			if (options.encoding === 'buffer') buf.push(chunk);
			else buf += chunk;
		});
		res.once('end', () => {
			const body = (options.encoding === 'buffer') ? Buffer.concat(buf) : buf;
			resolve({body, response: res});
		});
	}));
}
