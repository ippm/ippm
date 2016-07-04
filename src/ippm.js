import cliParse from './ippm/cli-parse';
import {route} from './ippm/cmds';
import {asyncMain} from 'js-utils';

global.Promise = Promise;

export * from './ippm/cmds';

async function entrypoint() {
	const {cmd, options} = await cliParse();
	await route(cmd, options);
}

export const _entrypoint = () => asyncMain(entrypoint);
