const gulp = require('gulp');
const imagemin = require('gulp-imagemin');
const mozjpeg = require('imagemin-mozjpeg');
const uglify = require('gulp-uglify-es').default;
 
gulp.task('img', () =>
    gulp.src('src/img/*.jpg')
        .pipe(imagemin({ use: mozjpeg({ quality: 75 }) }))
        .pipe(gulp.dest('dist/img'))
);
gulp.task('css', () =>
    gulp.src('src/css/*')
        .pipe(gulp.dest('dist/css'))
);
gulp.task('js', () =>
    gulp.src('src/js/*')
        .pipe(uglify())
        .pipe(gulp.dest('dist/js'))
);
gulp.task('files', () =>
    gulp.src(['src/*.xml', 'src/*.html', 'src/*.png',
              'src/*.json', 'src/*.js', 'src/*.svg',
              'src/*.ico'])
        .pipe(gulp.dest('dist'))
);
gulp.task('default', ['img', 'css', 'js', 'files']);
