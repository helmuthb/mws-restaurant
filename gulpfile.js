const gulp = require('gulp');
const imagemin = require('gulp-imagemin');
const mozjpeg = require('imagemin-mozjpeg');
const uglify = require('gulp-uglify-es').default;
const cssnano = require('gulp-cssnano');
const critical = require('critical');
const rename = require('gulp-rename');

gulp.task('img', () =>
    gulp.src('src/img/*.jpg')
        .pipe(imagemin([ mozjpeg({ quality: 30 }) ]))
        .pipe(gulp.dest('dist/img'))
);
gulp.task('css', () =>
    gulp.src('src/css/*')
        .pipe(cssnano())
        .pipe(gulp.dest('dist/css'))
);
gulp.task('js', () =>
    gulp.src('src/js/*')
        .pipe(uglify())
        .pipe(gulp.dest('dist/js'))
);
gulp.task('files', () =>
    gulp.src(['src/*.xml', 'src/*.png', 'src/*.json',
              'src/*.js', 'src/*.svg', 'src/*.ico'])
        .pipe(gulp.dest('dist'))
);
gulp.task('html', () =>
    gulp.src('src/*.html')
        .pipe(rename({ suffix: '-original' }))
        .pipe(gulp.dest('dist'))
);
gulp.task('build', ['img', 'css', 'js', 'files', 'html']);
gulp.task('critical', ['build'], () => {
  critical.generate({
    inline: true,
    base: 'dist/',
    src: 'index-original.html',
    dest: 'index.html',
    minify: true,
    width: 600,
    height: 800
  });
  critical.generate({
    inline: true,
    base: 'dist/',
    src: 'restaurant-original.html',
    dest: 'restaurant.html',
    minify: true,
    width: 600,
    height: 800
  });
});
gulp.task('default', ['critical']);
