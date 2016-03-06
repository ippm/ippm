export default function cliParse() {
	const rootArgs = process.argv.slice(2);

	return {
		cmd: rootArgs[0],
		options: {},
	};
}
