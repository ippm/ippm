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
	rollup: 'gulp-rollup',
	rollupBabel: ['rollup-plugin-babel'],
	filter: 'gulp-filter',
});

gulp.task('build', () =>
	gulp.src('./src/*.js', {read: false})
		.pipe($.rollup({
			format: 'cjs',
			sourceMap: true,
			external: ['babel-runtime'],
			plugins: [
				$.rollupBabel({
					babelrc: false,
					presets: ['es2015-rollup'],
					plugins: ['transform-runtime', 'transform-function-bind'],
					runtimeHelpers: true,
				}),
			],
		}))
		.pipe($.rename(p => {
			p.dirname += `/${p.basename}`;
		}))
		.pipe($.sourcemaps.write('./'))
		.pipe(gulp.dest('packages'))
		.pipe($.filter(['**/*.js']))
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
		.pipe(gulp.dest('packages'))
);

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

gulp.task('clean', () =>
	$.del([
		'./packages/*/**',
		'!./packages/*/{,package.json,README.md}',
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
