import * as cmds from './ippm/cmds';
import yargs from 'yargs';
import {asyncMain} from 'js-utils';
import persistent from './libs/persistent';

global.Promise = Promise;
Promise.config({
	longStackTraces: true,
});

const argv = yargs
	.required(1)
	.command(
		'install [packages...]',
		'installs packages', {
			packages: {
				type: 'string',
				array: true,
			},
			save: {
				description: 'add packages to ippm.json',
				type: 'boolean',
				default: true,
			},
		}
	)
	.command(
		'list [package]',
		'lists installed packages', {
			package: {
				type: 'string',
			},
			type: {
				choices: ['flat', 'tree'],
				default: 'flat',
			},
		}
	)
	.command(
		'pin',
		'pins packages'
	)
	.command(
		'update',
		'updates packages'
	)
	.strict()
	.config()
	.global('config')
	.help()
	.version()
	.argv;

asyncMain(() => persistent.open().then(() => cmds[argv._[0]](argv)));
