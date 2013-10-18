var INHERIT = require('inherit'),
    cssbase = require('borschik-tech-procss'),
    PATH = require('path'),
    FS = require('fs'),
    VOW = require('vow'),
    SPRITER = require('spriter'),
    Spriter = null,

    stringRe = "(?:(?:'[^'\\r\\n]*')|(?:\"[^\"\\r\\n]*\"))",
    urlRe = "(?:(?:url\\(\\s*" + stringRe + "\\s*\\))|(?:url\\(\\s*[^\\s\\r\\n'\"]*\\s*\\)))",
    urlRx = new RegExp(urlRe),

    repeatVals = [ 'repeat', 'repeat-x', 'repeat-y', 'no-repeat' ],
    bgRepeatRe = repeatVals.join('|'),

    xSides = [ 'left', 'center', 'right' ],
    ySides = [ 'bottom', 'center', 'top' ],
    numValueRe = '(?:\\d{1,3})(?:\\.\\d{1,3})?(?:px|%)*',
    bgPositionRe = '\\b('+ numValueRe +'|(?:' + xSides.join('|') + '))' +
        '(?:\\s*\\b('+ numValueRe +'|(?:' + ySides.join('|') + ')))?';

exports.Tech = INHERIT(cssbase.Tech, {

    Task: exports.Task = INHERIT(cssbase.Task, {

        process_base: function() {
            var params = this.params,
                rule = params.rule,
                value = rule.get(params.commandDecl),
                url = getUrl(value),
                based;

            if (isLinkProcessable(url)) {
                url = PATH.resolve(params.filePath, url);

                if (FS.existsSync(url)) {
                    based = makeBase64DataUrl(url);

                    if (based) {
                        this.params.rule
                            .set('background-image', 'url(' + based + ')');
                    }
                }
            }

            return rule.toString();
        },

        process_sprite: function(spriteName, padding) {
            var task = this,
                params = this.params,
                rule = params.rule,
                cmdDeclValue = rule.get(params.commandDecl),
                url = cmdDeclValue && getUrl(cmdDeclValue);

            if (url && isLinkProcessable(url)) {
                url = PATH.resolve(PATH.dirname(params.filePath), url);

                if (FS.existsSync(url)) {
                    var bgRepeatRx = new RegExp(bgRepeatRe),
                        bgRepeat = rule.get('background-repeat'),
                        bgPosition = rule.get('background-position'),
                        img = {};

                    img.cssFilePath = params.filePath;
                    img.outputFile = task.tech.opts.output.path;

                    img.url = url;

                    img.spriteName = spriteName !== '' && spriteName || 'default';

                    img.padding = padding &&
                        parseImagePadding(padding.split(' ')) || [ 0, 0, 0, 0 ];

                    img.position = bgPosition &&
                        parseBgPosition(bgPosition || cmdDeclValue) || { x: '0px', y: '0px' };

                    bgRepeat = bgRepeatRx.exec(bgRepeat || cmdDeclValue);
                    img.repeat = bgRepeat && bgRepeat[0] || 'no-repeat';

                    if (SPRITER.isImageSpritable(img)) {
                        var postProcessTask = task.tech.postProcessTasks &&
                            task.tech.postProcessTasks['sprite'];

                        if ( ! postProcessTask) {
                            postProcessTask = task.tech
                                .createPostProcessTask('sprite', {
                                    images: []
                                });
                        }

                        img.id = (Math.random() + '').substring(2, 10);

                        postProcessTask.params.images.push(img);

                        rule.decls[params.commandDecl]
                            .tail += ' ' + '/* ' + task.tech.File.keyword + '.task(sprite, ' + img.id + ') */';

                    } else {
                        console.log('Bad rules', task)
                    }
                }
            }

            return rule.toString();
        },

        post_process_sprite: function(processResult) {
            var task = this,
                imagesToSprite = task.params.images,
                postProcessResult = VOW.promise(processResult);

            if (imagesToSprite) {
                var resolvedPath = PATH.resolve(task.tech.opts.output.path);

                postProcessResult = postProcessResult
                    .then(function() {
                        Spriter || (Spriter = new SPRITER(PATH.dirname(resolvedPath)));

                        return Spriter.make(imagesToSprite);
                    })
                    .then(function(sprites) {
                        return sprites.reduce(function(resultsById, sprite) {
                            var spritePath = task.tech
                                .createFile(PATH.resolve(resolvedPath, sprite.url), 'linkUrl')
                                .processLink(resolvedPath);

                            sprite.images.forEach(function(image) {
                                image.ids.forEach(function(id) {

                                    resultsById[id] = function(rule) {
                                        var command = rule.command,
                                            cmdDecl = rule.decls[command.decl];

                                        if (cmdDecl) {
                                            var prop = cmdDecl.prop,
                                                value = cmdDecl.value,
                                                url = urlRx.exec(value);

                                            if (url) {
                                                value = value.replace(url[0], '').trim();

                                                var parsedPosition,
                                                    parsedRepeat;

                                                if (prop === 'background' && value !== '') {
                                                    parsedPosition = parseBgPosition(value);
                                                    parsedPosition &&
                                                    (value = value.replace(parsedPosition.raw, '').trim());

                                                    parsedRepeat = (new RegExp(bgRepeatRe)).exec(value);
                                                    parsedRepeat = parsedRepeat && parsedRepeat[0];
                                                    parsedRepeat &&
                                                    (value = value.replace(parsedRepeat, '').trim());
                                                }

                                                if (!parsedPosition) {
                                                    parsedPosition = rule.get('background-position');
                                                    parsedPosition = parsedPosition && parseBgPosition(parsedPosition);
                                                    parsedPosition &&
                                                    rule.del('background-position');
                                                }

                                                if (!parsedRepeat) {
                                                    parsedRepeat = rule.get('background-repeat');
                                                    parsedRepeat &&
                                                    rule.del('background-repeat');
                                                }

                                                image.positionX = parseInt(image.positionX, 10);
                                                image.positionY = parseInt(image.positionY, 10);

                                                if (parsedPosition) {
                                                    image.positionX += parseInt(parsedPosition.x || 0, 10);
                                                    image.positionY += parseInt(parsedPosition.y || 0, 10);
                                                }

                                                image.positionX = image.positionX == 0 ? '0' : (-image.positionX + 'px');
                                                image.positionY = image.positionY == 0 ? '0' : (-image.positionY + 'px');

                                                image.repeat = parsedRepeat || 'no-repeat';

                                                value === '' ?
                                                    rule.del(prop) :
                                                    rule.set(prop, value);

                                                rule.set('background-image', spritePath);
                                                rule.set('background-repeat', image.repeat);
                                                rule.set('background-position', image.positionX + ' ' + image.positionY);
                                            }
                                        }

                                        return rule.toString();
                                    };
                                });
                            });

                            return resultsById;


                        }, {});
                    })
                    .then(function(resultsById) {
                        var file = task.tech.File,
                            ruleWithSpriteTaskRe = '\\s*(' + file.selectorRe + ')\\s*' +
                                '{(' +
                                '[^}]*?' +
                                '\\s*' + file.declRe + '\\s*;\\s*' + '\\/\\*\\s*' +
                                file.keyword + '\\.task\\(sprite,\\s*' + '(\\d+)' +
                                '\\)\\s*\\*/' + '\\s*' +
                                '[^}]*?' +
                                ')}',
                            declsBlockWithTaskRx = new RegExp('^' + ruleWithSpriteTaskRe, 'mg'),
                            found = [],
                            result,
                            r;

                        while (r = declsBlockWithTaskRx.exec(processResult)) {
                            var rule = new task.tech.Rule(r[0]),
                                command = rule.command;

                            if (command && command.params) {
                                var id = command.params.split(',')[1];

                                id = id && id.trim();
                                result = id && resultsById[id];

                                result && typeof result === "function" &&
                                (result = result.call(task, rule));

                                if (result) {
                                    found.push({
                                        range: [r.index, declsBlockWithTaskRx.lastIndex],
                                        result: result
                                    });
                                }
                            }
                        }

                        return file.makeParsed(found, processResult);
                    })
            }

            return postProcessResult;
        }

    })

});

function getUrl(string) {
    var url = urlRx.exec(string);

    return url && parseUrl(url[0]);
}

function parseUrl(url) {
    if (url.lastIndexOf('url(', 0) === 0) url = url.replace(/^url\(\s*/, '').replace(/\s*\)$/, '');

    if (url.charAt(0) === '\'' || url.charAt(0) === '"') url = url.substr(1, url.length - 2);

    return url;
}

function parseBgPosition(content) {
    var bgPositionRx = new RegExp(bgPositionRe),
        foundPosition = bgPositionRx.exec(content),
        position;

    if (foundPosition) {
        var x = foundPosition[1],
            y = foundPosition[2],
            xSideIndex,
            ySideIndex;

        position = {};

        xSideIndex = xSides.indexOf(x);
        xSideIndex !== -1 && (x = 50 * xSideIndex + '%');
        x === '0' && (x += 'px');

        ySideIndex = y ? ySides.indexOf(y) : 1;
        ySideIndex !== -1 && (y = 50 * ySideIndex + '%');
        y === '0' && (y += 'px');

        position.x = x;
        position.y = y;
        position.raw = foundPosition[0];
    }

    return position;
}

function parseImagePadding(v) {
    var padding = [ 0, 0, 0, 0 ];

    if (Array.isArray(v)) {
        padding = [
            v[0],
            v[1] || v[0],
            v[2] || v[0],
            v[3] || v[1] || v[0]
        ].map(function(v) {
                return parseInt(v, 10);
            });
    }

    return padding;

}

function makeBase64DataUrl(url) {
    var base64data = FS.readFileSync(url, 'base64');

    url = 'data:image/' + PATH.extname(url) + ';base64,' + base64data;

    return url;
}

function isLinkProcessable(url) {
    return !(~['#', '?', '/'].indexOf(url.charAt(0)) || isAbsoluteUrl(url));
}

function isAbsoluteUrl(url) {
    return /^\w+:/.test(url);
}
