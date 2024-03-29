'use strict';

var _argparse = require('argparse');

var _argparse2 = _interopRequireDefault(_argparse);

var _colors = require('colors');

var _colors2 = _interopRequireDefault(_colors);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _csvtojson = require('csvtojson');

var _csvtojson2 = _interopRequireDefault(_csvtojson);

var _cliProgress = require('cli-progress');

var _cliProgress2 = _interopRequireDefault(_cliProgress);

var _axios2 = require('axios');

var _axios3 = _interopRequireDefault(_axios2);

var _formData = require('form-data');

var _formData2 = _interopRequireDefault(_formData);

var _mqtt = require('mqtt');

var _mqtt2 = _interopRequireDefault(_mqtt);

var _url = require('url');

var _url2 = _interopRequireDefault(_url);

var _events = require('events');

var _events2 = _interopRequireDefault(_events);

var _moment = require('moment');

var _moment2 = _interopRequireDefault(_moment);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; } /*
                                                                                                                                                                                                                  *    Uploader.
                                                                                                                                                                                                                  *
                                                                                                                                                                                                                  *    Receives csv or json files describing missions. Creates and uploads the files.
                                                                                                                                                                                                                  */

var argv = void 0;
var parser = void 0;
var __dirname = _path2.default.resolve();
var token = void 0;
var server = void 0;
var serverCfg = void 0;
var mqttCfg = void 0;
var mqttClient = void 0;
var processingEvents = new _events2.default();

parseArguments();
token = Buffer.from(argv.user + ':' + argv.password, 'utf8').toString('base64');
server = argv.server;
start();

/**
 * Start Processing
 */
async function start() {

    try {
<<<<<<< HEAD
        var pjson = JSON.parse(_fs2.default.readFileSync('./package.json', 'utf8'));
        console.log(_colors2.default.yellow('Ver: ' + pjson.version.toString()));
=======
>>>>>>> ff67ab9a62dba85e17b2d867b278a8715d715e51

        if (!argv.input) {
            console.log(_colors2.default.red('Nothing to read. Please provide file path'));
            return process.exit(1);
        }

        if (!_fs2.default.existsSync(argv.input)) {
            console.log(_colors2.default.red('Could not find ' + argv.input));
            return process.exit(1);
        }

        // Read configuration file in json or csv format
        var config = await readInputFile(argv.input);

        // Connect to server
        await connectServer(argv.server, token);

        // Get server configuration (for MQTT)
        await getMqttCfg(argv.server, token);

        // Connect to MQTT broker
        await connectMqtt();

        var _start = new Date().getTime();

        // Upload missions
        await uploadAllMissions(config);

        // Do processing
        await processAllMissions(config);

        // Import bookmarks
        await importBookmarks(config);

        var end = new Date().getTime();
        console.log(_colors2.default.green('Processing complete (in ' + _moment2.default.duration(end - _start, 'milliseconds').humanize() + ')'));

        if (mqttClient) mqttClient.end();

        process.exit(0);
    } catch (error) {
        console.log(_colors2.default.red(error.message));
        return process.exit(1);
    }
}

var splitToArray = function splitToArray(item) {
    if (item && item.length > 0) {
        var ugs = item.split(',');
        return ugs.map(function (ug) {
            return ug.trim();
        });
    } else return item ? item.split(',') : item;
};

/**
 * Read file in json or csv format
 * @param  {} file
 */
async function readInputFile(file) {

    return new Promise(async function (resolve, reject) {

        var cfg = void 0;
        // Check if input file is csv or json
        try {
            // Check if input file is json
            var fileData = _fs2.default.readFileSync(file);
            cfg = JSON.parse(fileData);

            return resolve(cfg);
        } catch (error) {}

        // Check if input file is csv
        try {
            cfg = await (0, _csvtojson2.default)().fromFile(file);

            cfg = cfg.map(function (c) {
                var m = c.Mission;
                if (m._id === "") delete m._id;

                if (m.tags && m.tags.length > 0) {
                    m.tags = splitToArray(m.tags);
                }
                if (m.usergroups && m.usergroups.length > 0) {
                    m.usergroups = splitToArray(m.usergroups);
                }

                return m;
            });

            resolve(cfg);
        } catch (error) {
            reject('Unknown file format');
        }
    });
}

/**
 *  Connect to server
 */
async function connectServer(server, token) {

    return new Promise(async function (resolve, reject) {
        try {
            var ret = await (0, _axios3.default)(server + '/api/info', {
                headers: { 'Authorization': 'Basic ' + token }
            });

            serverCfg = ret.data;

            console.log('Server: ' + _colors2.default.yellow('' + serverCfg.serverName) + '  ver. ' + _colors2.default.yellow('' + serverCfg.serverVer));
            console.log('Server up: ' + _colors2.default.yellow('' + serverCfg.serverStartTime) + '  Video dir: ' + _colors2.default.yellow('' + serverCfg.videoDir));

            resolve();
        } catch (error) {
            reject(new Error('Error connecting to server - ' + error.message + ' -' + error.response.statusText));
        }
    });
}

/**
 * Get MqttCfg configuration
 */
async function getMqttCfg(server, token) {

    return new Promise(async function (resolve, reject) {
        try {
            var ret = await (0, _axios3.default)(server + '/api/mqttConfig', {
                headers: { 'Authorization': 'Basic ' + token }
            });

            mqttCfg = ret.data;

            var brokerUrl = _url2.default.parse(mqttCfg.broker);
            var serverUrl = _url2.default.parse(server);
            var wsProtocol = serverUrl.protocol === 'https:' ? 'wss' : 'ws';

            if (serverUrl.hostname === 'localhost') {
                // for localhost server, use localhost broker               
                if (brokerUrl.hostname === 'localhost') {
                    mqttCfg.broker = wsProtocol + '://' + serverUrl.hostname + ':' + mqttCfg.wsPort;
                }
            } else {
                if (mqttCfg.mqtt_broker_ws != undefined) {
                    mqttCfg.broker = _mqtt2.default.mqtt_broker_ws;
                } else {
                    // Use /ws in case we're on port 80 and most likely using reverse proxy
                    mqttCfg.broker = serverUrl.port === '' || serverUrl.port === 80 || serverUrl.port === null ? wsProtocol + '://' + serverUrl.hostname + '/ws' : wsProtocol + '://' + serverUrl.hostname + ':' + mqttCfg.wsPort;
                }
            }

            console.log('MQTT broker: ' + _colors2.default.yellow('' + mqttCfg.broker));
            resolve();
        } catch (error) {
            reject(new Error('Error connecting to server - ' + error.message));
        }
    });
}

/**
 * connectMqtt - connect to MQTT broker
 */
function connectMqtt() {

    return new Promise(function (resolve, reject) {

        var min = 1;
        var max = 100000;
        var random = Math.floor(Math.random() * (+max - +min)) + +min;

        var options = {
            clientId: 'uploadProcClient-' + random,
            clean: true,
            connectTimeout: 50000
            //  port: mqttCfg.wsPort,
        };

        mqttClient = _mqtt2.default.connect('' + mqttCfg.broker, options);
        mqttClient.on('connect', function () {

            console.log('app connected to mqtt');
            mqttClient.subscribe('stserver/' + serverCfg.serverName + '/#', {}, function (err) {
                if (err) console.log(err);else mqttClient.publish('uploader', 'connected');

                resolve();
            });
        });
        mqttClient.on('disconnect', function () {
            //  console.log('disconnect');
        });

        mqttClient.on('error', function (err) {
            console.log(err);
            reject(err);
        });

        mqttClient.on('message', async function (topic, message) {

            try {

                var topicParsed = topic.split('/');
                var topicName = topicParsed.pop().toLowerCase();
                var info = void 0;

                switch (topicName) {

                    case 'missions':
                        info = JSON.parse(message.toString());
                        processingEvents.emit('processing', info);
                        break;

                    case 'mission_update':
                        info = JSON.parse(message.toString());
                        processingEvents.emit('processing', info);
                        break;

                    default:
                        break;
                }
            } catch (error) {
                console.log(_colors2.default.red(error.message));
            }
        });
    });
}

/**
 * upload all missions processing. 
 */
async function uploadAllMissions(config) {

    return new Promise(async function (resolve, reject) {
        var totalMissions = config.length;
        console.log('Upload ' + _colors2.default.yellow(totalMissions + ' ') + 'missions...');

        var progressBar = new _cliProgress2.default.SingleBar({
            format: 'Missions: {mission}/' + totalMissions + ' ' + _colors2.default.cyan('{bar}') + ' {percentage}% | Name: {name} | ' + '{message}',
            fps: 5,
            barCompleteChar: '\u2588',
            barIncompleteChar: '\u2591',
            hideCursor: true
        }, _cliProgress2.default.Presets.rect);

        progressBar.start(100, 0, { mission: 0, name: '', message: '' });

        var count = 0;
        var progressBarWasStopped = false;
        var message = void 0;

        // Go over the mission list and upload them.
        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
            var _loop = async function _loop() {
                var m = _step.value;

                try {

                    message = 'uploading...';
                    if (progressBarWasStopped) {
                        progressBar.start(100, count, { mission: count, name: m.name, message: _colors2.default.green(message) });
                        progressBarWasStopped = false;
                    }

                    progressBar.update(Number((count / totalMissions * 100.0).toFixed(0)), {
                        mission: _colors2.default.green(count.toString()),
                        name: m.name,
                        message: _colors2.default.green('uploading...')
                    });

                    var res = await uploadMission(m, function (ev) {
                        message = ev.message;
                        progressBar.update(Number((count / totalMissions * 100.0).toFixed(0)), {
                            mission: _colors2.default.green(count.toString()),
                            name: m.name,
                            message: _colors2.default.magenta(message)
                        });
                    });
                    count++;

                    progressBar.update(Number((count / totalMissions * 100.0).toFixed(0)), {
                        mission: _colors2.default.green(count.toString()),
                        name: m.name,
                        message: message === 'uploading...' ? _colors2.default.green('done.') : _colors2.default.magenta(message)
                    });

                    await new Promise(function (r) {
                        return setTimeout(r, 1000);
                    });

                    if (message != 'uploading...') {
                        progressBar.stop();
                        progressBarWasStopped = true;
                    }
                } catch (error) {
                    progressBar.stop();
                    console.log(_colors2.default.red('Mission upload error: ') + ('' + error.message));
                    count++;
                    progressBarWasStopped = true;
                }
            };

            for (var _iterator = config[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                await _loop();
            }
        } catch (err) {
            _didIteratorError = true;
            _iteratorError = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion && _iterator.return) {
                    _iterator.return();
                }
            } finally {
                if (_didIteratorError) {
                    throw _iteratorError;
                }
            }
        }

        progressBar.stop();
        console.log(_colors2.default.green('Upload Complete'));
        resolve();
    });
}

/**
 * Upload one mission
 */
async function uploadMission(mission, cb) {

    return new Promise(async function (resolve, reject) {
        try {

            // Make sure no forward slash is in the mission names
            mission.name = mission.name.replace(/\//g, '-');

            if (mission.sensors && Array.isArray(mission.sensors) && mission.sensors.length > 0) {

                mission.sensors.forEach(function (s) {
                    return s.name = s.name.replace(/\//g, '-');
                });
            }

            // Create mission
            var ret = await _axios3.default.post(server + '/api/missions', mission, {
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                headers: { 'Authorization': 'Basic ' + token }
            });

            var mi = ret.data.mission;

            // Upload sensors and start processing 
            var sensors = mission.sensors;
            if (sensors && Array.isArray(sensors) && sensors.length > 0) {
                sensors.forEach(async function (s) {
                    var _axios;

                    var files = s.assets ? s.assets : s.files;

                    if (!Array.isArray(files) && files && files.length > 0) {
                        files = splitToArray(files);
                    }

                    // Check if the file exists. First, check the local machine and upload, if found. If not, just pass the path, so the server would try to locate it at its end.
                    var form_data = new _formData2.default();

                    files.forEach(function (f) {
                        if (_fs2.default.existsSync(f)) {
                            form_data.append("files", _fs2.default.createReadStream(f));
                        } else {
                            if (cb) cb({ message: 'file ' + f + ' was not found locally. Will try to locate it on the server' });
                            //   console.log(colors.magenta(`\nfile ${f} was not found locally. Will try to locate it on the server`));
                            form_data.append("serverLocatedFiles", f);
                        }
                    });

                    var config = {
                        onUploadProgress: function onUploadProgress(progressEvent) {
                            var percentCompleted = Math.floor(progressEvent.loaded * 100 / progressEvent.total);
                        }

                        // Make sure no forward slash is in the sensor names                  
                    };(0, _axios3.default)((_axios = {
                        method: 'post',
                        url: server + '/api/missions/upload/' + mi.name + '/' + s.name + '?processAfterUpload=addToProcessingQueue',
                        data: form_data,
                        maxContentLength: Infinity,
                        maxBodyLength: Infinity,
                        headers: {
                            'Authorization': 'Basic ' + token,
                            'Content-Type': 'multipart/form-data; boundary=' + ('' + form_data._boundary)
                        }
                    }, _defineProperty(_axios, 'maxContentLength', Infinity), _defineProperty(_axios, 'onUploadProgress', function onUploadProgress(progressEvent) {
                        //         const progress = ((progressEvent.loaded / progressEvent.total) * 100).toFixed(0);

                    }), _axios)).then(function (res) {
                        //console.log('Upload complete');
                        resolve();
                    }).catch(function (error) {
                        var err = new Error('Upload failed - ' + error.message + '. ' + (error.response ? error.response.data : ''));
                        reject(err);
                    });
                });
            }
        } catch (error) {
            var err = new Error(error.message + '. ' + (error.response ? error.response.data : ''));
            reject(err);
        }
    });
}

/**
 * Do all missions processing. Process missions one by one
 */
async function processAllMissions(config) {

    return new Promise(async function (resolve, reject) {

        var progressBar = void 0;

        (0, _axios3.default)({
            method: 'put',
            url: server + '/api/missions/process',
            headers: {
                'Authorization': 'Basic ' + token
            }
        }).then(async function (res) {

            var totalMissions = config.length;
            var totalTasks = res.data.tasks;
            var totalClipSegments = void 0;
            var processedSegments = 0;
            var ingestedSegments = 0;
            var count = 0;
            var progressMessage = '';
            var operationType = 'Processing';
            var detectedStreamInfo = void 0;

            console.log('Process ' + _colors2.default.yellow(totalMissions + ' ') + 'missions. Processing tasks scheduled at server: ' + _colors2.default.yellow(totalTasks + ' '));

            progressBar = new _cliProgress2.default.SingleBar({
                format: 'Missions: {task}/' + totalTasks + ' ' + _colors2.default.cyan('{bar}') + ' {percentage}% | Segments: {segments}:{ingested} | {operation}: {name} | ' + '{message}',
                fps: 15,
                barCompleteChar: '\u2588',
                barIncompleteChar: '\u2591',
                hideCursor: true
            }, _cliProgress2.default.Presets.rect);

            processingEvents.addListener('processing', function (info) {

                if (!info.queueEmpty) {
                    if (info.type) {

                        var segmentName = void 0;
                        switch (info.type) {

                            case 'hlsDetection':
                                detectedStreamInfo = info.value;
                                operationType = 'Processing';
                                progressMessage = _colors2.default.magenta('detecting...');
                                totalClipSegments = undefined;
                                break;

                            case 'hlsProcessing':
                                if (totalClipSegments === undefined) totalClipSegments = Math.round(info.value.sourceDuration / info.value.segmentDuration) + 1;

                                processedSegments++;
                                segmentName = _path2.default.basename(info.value.path);
                                operationType = 'Processing';
                                progressMessage = _colors2.default.brightBlue(info.value.totalSegments + '/' + totalClipSegments);
                                break;

                            case 'hlsProcessingComplete':
                                progressMessage = _colors2.default.brightBlue('Hls processing complete');
                                segmentName = '';
                                break;

                            case 'ingest_progress':
                                operationType = 'Ingesting';
                                ingestedSegments++;
                                totalClipSegments = info.value.totalSegments; // Now we know for sure...
                                progressMessage = _colors2.default.brightBlue(info.value.currentIndex + '/' + info.value.totalSegments);
                                segmentName = _path2.default.basename(info.value.segmentName);
                                break;

                            case 'ingest_complete':
                                count++;
                                segmentName = '';
                                break;

                            case 'areaCalculation':
                                operationType = 'Area Calc';

                                if (info.value.phase === 'start') progressMessage = _colors2.default.magenta('calculating...');else {
                                    segmentName = (info.value.area ? info.value.area.toFixed(1) : 0) + ' sq. km';
                                    progressMessage = _colors2.default.green('complete.');
                                }

                                break;

                            default:
                                break;
                        }

                        progressBar.update(Number((count / totalTasks * 100.0).toFixed(0)), {
                            task: _colors2.default.green(count.toString()),
                            segments: processedSegments,
                            ingested: ingestedSegments,
                            operation: operationType,
                            name: segmentName || '',
                            message: progressMessage
                        });
                    }
                } else {
                    progressBar.update(Number((count / totalTasks * 100.0).toFixed(0)), {
                        task: _colors2.default.green(count.toString()),
                        operation: 'Processing',
                        name: 'Complete',
                        segments: processedSegments,
                        ingested: ingestedSegments,
                        message: info.message ? _colors2.default.magenta(info.message) : _colors2.default.green('done')
                    });
                    progressBar.stop();
                    console.log('Processed ' + _colors2.default.yellow(processedSegments) + ' segments. Ingested ' + _colors2.default.yellow(ingestedSegments));
                    resolve();
                }
            });

            progressBar.start(100, 0, { task: 0, segments: 0, ingested: 0, name: '', operation: 'Processing', message: '' });
        }).catch(function (error) {
            var err = new Error('Processing failed - ' + error.message + '. ' + (error.response ? error.response.data : ''));
            progressBar.stop();
            reject(err);
        });
    });
}

/**
 * Process bookmarks
 */
async function importBookmarks(config) {

    return new Promise(async function (resolve, reject) {
        // Go over the mission list and extract bookmarks.

        var _iteratorNormalCompletion2 = true;
        var _didIteratorError2 = false;
        var _iteratorError2 = undefined;

        try {
            for (var _iterator2 = config[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                var _m = _step2.value;

                try {
                    if (_m.hasOwnProperty('bookmarks') && Array.isArray(_m.bookmarks) && _m.bookmarks.length > 0) {
                        console.log('Import ' + _m.bookmarks.length + ' bookmarks for mission ' + _m.name);

                        var _iteratorNormalCompletion3 = true;
                        var _didIteratorError3 = false;
                        var _iteratorError3 = undefined;

                        try {
                            for (var _iterator3 = _m.bookmarks[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
                                var bm = _step3.value;

                                // Fill the names, if not provided (legacy schema)
                                if (!bm.missionName) bm.missionName = _m.name;
                                if (!bm.sensorName && Array.isArray(_m.sensors) && _m.sensors.length > 0) bm.sensorName = _m.sensors[0].name;

                                // Create bookmark
                                try {
                                    var ret = await _axios3.default.post(server + '/api/bookmarks', bm, { headers: { 'Authorization': 'Basic ' + token } });
                                } catch (error) {
                                    console.log(_colors2.default.red('Error importing bookmark: ') + (error.message + '.  ' + (error.response ? error.response.data : '')));
                                }
                            }
                        } catch (err) {
                            _didIteratorError3 = true;
                            _iteratorError3 = err;
                        } finally {
                            try {
                                if (!_iteratorNormalCompletion3 && _iterator3.return) {
                                    _iterator3.return();
                                }
                            } finally {
                                if (_didIteratorError3) {
                                    throw _iteratorError3;
                                }
                            }
                        }
                    }
                } catch (error) {

                    console.log(_colors2.default.red('Error importing bookmarks: ') + ('' + error.message));
                }
            }
        } catch (err) {
            _didIteratorError2 = true;
            _iteratorError2 = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion2 && _iterator2.return) {
                    _iterator2.return();
                }
            } finally {
                if (_didIteratorError2) {
                    throw _iteratorError2;
                }
            }
        }

        resolve();
    });
}

/**
 * Parse command line args
 */
function parseArguments() {
    try {
        parser = new _argparse2.default.ArgumentParser({ add_help: true, description: 'Uploader', epilog: 'Start Uploader...' });
        parser.add_argument('-i', '--input', { metavar: '', help: 'Input configuration file path' });
        parser.add_argument('-s', '--server', { metavar: '', help: 'Server url' });
<<<<<<< HEAD
        parser.add_argument('-u', '--user', { metavar: '', default: "guest", help: 'User name' });
        parser.add_argument('-p', '--password', { metavar: '', default: "guest", help: 'Password' });
        parser.add_argument('--printUsage', { metavar: '', default: 'false', help: 'Print args description (true/false)' });
        //      parser.add_argument('-v', '--version', action='store_true', nargs='*', { metavar: '', help: 'Version' });
=======
        parser.add_argument('-u', '--user', { metavar: '', help: 'User name' });
        parser.add_argument('-p', '--password', { metavar: '', help: 'Password' });
        parser.add_argument('--printUsage', { metavar: '', default: 'false', help: 'Print args description (true/false)' });
        parser.add_argument('-v', '--version', { metavar: '', help: 'Version' });
>>>>>>> ff67ab9a62dba85e17b2d867b278a8715d715e51

        argv = parser.parse_args();
        if (JSON.parse(argv.printUsage.trim())) parser.printHelp();
    } catch (error) {
        console.log(_colors2.default.red('Argument parse error: ' + error.message + '\n'));
    }
}

cleanup(function () {
    process.stderr.write('\x1B[?25h'); // Show terminal cursor
    console.log("");
});

/**
 * cleanup
 * @param  {} callback
 */
function cleanup(callback) {

    // attach user callback to the process event emitter
    // if no callback, it will still exit gracefully on Ctrl-C
    callback = callback || noOp;
    process.on('cleanup', callback);

    // do app specific cleaning before exiting
    process.on('exit', function () {
        process.emit('cleanup');
    });

    // catch ctrl+c event and exit normally
    process.on('SIGINT', function () {
        // console.log('warn', 'Ctrl-C...');  
        process.exit(2);
    });

    // catch terminate and exit normally
    process.on('SIGTERM', function () {
        // console.log('warn', 'Terminated...');
        process.exit(2);
    });

    // catch terminate and exit normally
    process.on('SIGQUIT', function () {
        // console.log('warn', 'Quit...'); 
        process.exit(2);
    });

    //catch uncaught exceptions, trace, then exit normally
    process.on('uncaughtException', function (e) {
        console.log('error', 'Uncaught Exception...');
        console.log(e.stack);
        process.exit(99);
    });
};