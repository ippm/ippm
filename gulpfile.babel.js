import gulp from 'gulp';
import lazyReq from 'lazyreq';

const $ = lazyReq(require, {
	newer: 'gulp-newer',
	cached: 'gulp-cached',
	babel: 'gulp-babel',
	env: 'gulp-env',
	uglify: 'gulp-uglify',
	rename: 'gulp-rename',
	sourcemaps: 'gulp-sourcemaps',
	del: 'del',
	runSequence: ['run-sequence', rs => rs.use(gulp)],
	eslint: 'gulp-eslint',
	mocha: 'gulp-mocha',
	istanbul: 'gulp-istanbul',
	isparta: 'isparta',
	rollup: ['rollup', 'rollup'],
	rollupBabel: ['rollup-plugin-babel'],
});

gulp.task('build', ['build-es5', 'build-es2015', 'min-es5']);

gulp.task('build-es5', async () => {
	const bundle = await $.rollup({
		entry: './src/index.js',
		external: ['babel-runtime'],
		plugins: [
			$.rollupBabel({
				babelrc: false,
				presets: ['es2015-rollup'],
				plugins: ['transform-runtime', 'transform-function-bind'],
				runtimeHelpers: true,
			}),
		],
	});

	await bundle.write({
		dest: './build/index.js',
		format: 'cjs',
		sourceMap: true,
	});
});

gulp.task('min-es5', ['build-es5'], () =>
	gulp.src('./build/index.js')
		.pipe($.sourcemaps.init({loadMaps: true}))
		.pipe($.env.set({
			NODE_ENV: 'production',
		}))
		.pipe($.babel({
			babelrc: false,
			plugins: ['transform-inline-environment-variables'],
		}))
		.pipe($.uglify())
		.pipe($.rename('index.min.js'))
		.pipe($.sourcemaps.write('./'))
		.pipe(gulp.dest('build'))
);

gulp.task('build-es2015', async () => {
	const bundle = await $.rollup({
		entry: './src/index.js',
		plugins: [
			$.rollupBabel({
				babelrc: false,
				plugins: ['transform-function-bind'],
				runtimeHelpers: true,
			}),
		],
	});

	await bundle.write({
		dest: './build/index.es2015.js',
		sourceMap: true,
	});
});

gulp.task('lint', () =>
	gulp.src(['./src/**/*.js', './gulpfile.babel.js', './test/**/*.js'])
		.pipe($.cached('lint'))
		.pipe($.eslint())
		.pipe($.eslint.format())
		.pipe($.eslint.failOnError())
);

gulp.task('test', (cb) => {
	gulp.src([
		'./src/**/*.js',
		'!./src/deprecate.js',
	])
		.pipe($.istanbul({
			instrumenter: $.isparta.Instrumenter,
			includeUntested: true,
		}))
		.pipe($.istanbul.hookRequire())
		.on('finish', () => {
			gulp.src('./test/*.js', {read: false})
				.pipe($.mocha())
				.pipe($.istanbul.writeReports())
				.pipe($.istanbul.enforceThresholds({
					thresholds: {global: 90},
				}))
				.on('end', cb);
		});
});

gulp.task('clean', () =>
	$.del([
		'./build/**/*',
		'!./build/{,package.json,README.md}',
		'./coverage',
	])
);

gulp.task('watch', ['build', 'lint'], () => {
	gulp.watch('./src/**/*.js', ['build', 'lint']);
});

gulp.task('default', (cb) => {
	$.runSequence(
		'clean',
		['build', 'lint', 'test'],
		cb
	);
});
