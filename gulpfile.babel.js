import gulp from 'gulp';
import lazyReq from 'lazyreq';
import {qw, toAsync} from 'js-utils';

const $ = lazyReq(require, {
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
	rollup: 'gulp-rollup',
	rollupBabel: ['rollup-plugin-babel'],
	exec: ['child_process', 'exec', toAsync],
});

const PACKAGES = qw('ippm ippm-node ippm-adder ippm-systemjs');

gulp.task('build', PACKAGES.map(p => `build-${p}`));
gulp.task('build-min', PACKAGES.map(p => `build-min-${p}`));

PACKAGES.forEach(pakName => {
	// mk build-*
	gulp.task(`build-${pakName}`, () =>
		gulp.src('./src/**/*.js')
			.pipe($.sourcemaps.init())
			.pipe($.rollup({
				entry: `./src/${pakName}.js`,
				format: 'cjs',
				exports: 'named',
				sourceMap: true,
				plugins: [
					$.rollupBabel({
						babelrc: false,
						presets: ['es2015-rollup'],
						plugins: [
							'transform-runtime',
							'transform-function-bind',
							'transform-async-to-generator',
							'transform-class-properties',
						],
						runtimeHelpers: true,
					}),
				],
			}))
			.pipe($.sourcemaps.write('./'))
			.pipe(gulp.dest(`./packages/${pakName}`))
	);

	// mk build-min-*
	gulp.task(`build-min-${pakName}`, [`build-${pakName}`], () =>
		gulp.src(`./packages/${pakName}/${pakName}.js`)
			.pipe($.sourcemaps.init({loadMaps: true}))
			.pipe($.env.set({
				NODE_ENV: 'production',
			}))
			.pipe($.babel({
				babelrc: false,
				plugins: ['transform-inline-environment-variables'],
			}))
			.pipe($.uglify({
				mangle: {
					toplevel: true,
				},
			}))
			.pipe($.rename({suffix: '.min'}))
			.pipe($.sourcemaps.write('./'))
			.pipe(gulp.dest(`./packages/${pakName}`))
	);
});

gulp.task('lint', () =>
	gulp.src(['./src/**/*.js', './gulpfile.babel.js', './test/**/*.js'])
		.pipe($.cached('lint'))
		.pipe($.eslint())
		.pipe($.eslint.format())
		.pipe($.eslint.failOnError())
);

gulp.task('test', (cb) => {
	gulp.src('./src/**/*.js')
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

gulp.task('clean', () => $.exec('git clean -xf'));

gulp.task('default', (cb) => {
	$.runSequence(
		'clean',
		['build', 'lint', 'test'],
		cb
	);
});
