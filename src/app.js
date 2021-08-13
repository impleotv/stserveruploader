/*
*    Uploader.
*
*    Receives csv or json files describing missions. Creates and uploads the files.
*/

import argparse from 'argparse';
import colors from 'colors';
import path from 'path';
import fs from 'fs';
import csv from 'csvtojson';
import cliProgress from 'cli-progress';
import axios from 'axios';
import FormData from 'form-data';
import mqtt from 'mqtt';
import url from 'url';
import EventEmitter from 'events';
import moment from 'moment';

let argv;
let parser;
const __dirname = path.resolve();
let token;
let server;
let serverCfg;
let mqttCfg;
let mqttClient;
const processingEvents = new EventEmitter();

parseArguments();
token = Buffer.from(`${argv.user}:${argv.password}`, 'utf8').toString('base64');
server = argv.server;
start();

/**
 * Start Processing
 */
async function start() {

    try {

        if (!argv.input) {
            console.log(colors.red('Nothing to read. Please provide file path'));
            return process.exit(1);
        }

        if (!fs.existsSync(argv.input)) {
            console.log(colors.red(`Could not find ${argv.input}`));
            return process.exit(1);
        }

        // Read configuration file in json or csv format
        const config = await readInputFile(argv.input);

        // Connect to server
        await connectServer(argv.server, token);

        // Get server configuration (for MQTT)
        await getMqttCfg(argv.server, token);

        // Connect to MQTT broker
        await connectMqtt();

        const start = new Date().getTime();

        // Upload missions
        await uploadAllMissions(config);

        // Do processing
        await processAllMissions(config);

        const end = new Date().getTime();
        console.log(colors.green(`Processing complete (in ${moment.duration(end - start, 'milliseconds').humanize()})`));

        if (mqttClient)
            mqttClient.end();

        process.exit(0);

    } catch (error) {
        console.log(colors.red(error.message));
        return process.exit(1);
    }
}


const splitToArray = item => {
    if (item && item.length > 0) {
        const ugs = item.split(',');
        return ugs.map(ug => ug.trim());
    }
    else
        return item ? item.split(',') : item;
}

/**
 * Read file in json or csv format
 * @param  {} file
 */
async function readInputFile(file) {

    return new Promise(async (resolve, reject) => {

        let cfg;
        // Check if input file is csv or json
        try {
            // Check if input file is json
            const fileData = fs.readFileSync(file);
            cfg = JSON.parse(fileData);

            return resolve(cfg);

        } catch (error) {

        }

        // Check if input file is csv
        try {
            cfg = await csv().fromFile(file);

            cfg = cfg.map(c => {
                const m = c.Mission;
                if (m._id === "")
                    delete m._id;

                if (m.tags && m.tags.length > 0) {
                    m.tags = splitToArray(m.tags);
                }
                if (m.usergroups && m.usergroups.length > 0) {
                    m.usergroups = splitToArray(m.usergroups);
                }

                return m;
            })

            resolve(cfg);

        } catch (error) {
            reject('Unknown file format');
        }
    })
}


/**
 *  Connect to server
 */
async function connectServer(server, token) {

    return new Promise(async (resolve, reject) => {
        try {
            const ret = await axios(
                `${server}/api/info`, {
                headers: { 'Authorization': `Basic ${token}` }
            });

            serverCfg = ret.data;

            console.log('Server: ' + colors.yellow(`${serverCfg.serverName}`) + '  ver. ' + colors.yellow(`${serverCfg.serverVer}`));
            console.log('Server up: ' + colors.yellow(`${serverCfg.serverStartTime}`) + '  Video dir: ' + colors.yellow(`${serverCfg.videoDir}`));

            resolve();

        } catch (error) {
            reject(new Error(`Error connecting to server - ${error.message} -${error.response.statusText}`));
        }
    })
}


/**
 * Get MqttCfg configuration
 */
async function getMqttCfg(server, token) {

    return new Promise(async (resolve, reject) => {
        try {
            const ret = await axios(
                `${server}/api/mqttConfig`, {
                headers: { 'Authorization': `Basic ${token}` }
            });

            mqttCfg = ret.data;

            const brokerUrl = url.parse(mqttCfg.broker);
            const serverUrl = url.parse(server);
            const wsProtocol = serverUrl.protocol === 'https:' ? 'wss' : 'ws'; 

            if (serverUrl.hostname === 'localhost') {
                // for localhost server, use localhost broker               
                if (brokerUrl.hostname === 'localhost') {
                    mqttCfg.broker = `${wsProtocol}://${serverUrl.hostname}:${mqttCfg.wsPort}`;
                }       
              }
              else {
                if (mqttCfg.mqtt_broker_ws != undefined) {
                    mqttCfg.broker = mqtt.mqtt_broker_ws;
                }
                else {
                  // Use /ws in case we're on port 80 and most likely using reverse proxy
                  mqttCfg.broker = serverUrl.port === '' || serverUrl.port === 80 ||  serverUrl.port === null? `${wsProtocol}://${serverUrl.hostname}/ws` : `${wsProtocol}://${serverUrl.hostname}:${mqttCfg.wsPort}`;
                }
              }

            console.log('MQTT broker: ' + colors.yellow(`${mqttCfg.broker}`));
            resolve();

        } catch (error) {
            reject(new Error(`Error connecting to server - ${error.message}`));
        }
    })
}



/**
 * connectMqtt - connect to MQTT broker
 */
function connectMqtt() {

    return new Promise((resolve, reject) => {

        const min = 1;
        const max = 100000;
        const random = Math.floor(Math.random() * (+max - +min)) + +min;

        const options = {
            clientId: (`uploadProcClient-${random}`),
            clean: true,
            connectTimeout: 50000,
          //  port: mqttCfg.wsPort,
        };

        mqttClient = mqtt.connect(`${mqttCfg.broker}`, options);
        mqttClient.on('connect', () => {

            console.log('app connected to mqtt')
            mqttClient.subscribe(`stserver/${serverCfg.serverName}/#`, {}, err => {
                if (err)
                    console.log(err)
                else
                    mqttClient.publish('uploader', 'connected');

                resolve();
            });
        })
        mqttClient.on('disconnect', () => {
            //  console.log('disconnect');
        })

        mqttClient.on('error', err => {
            console.log(err)
            reject(err);
        })

        mqttClient.on('message', async (topic, message) => {

            try {

                const topicParsed = topic.split('/');
                const topicName = topicParsed.pop().toLowerCase();
                let info;

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
                console.log(colors.red(error.message));
            }
        })
    })
}


/**
 * upload all missions processing. 
 */
async function uploadAllMissions(config) {

    return new Promise(async (resolve, reject) => {
        const totalMissions = config.length;
        console.log('Upload ' + colors.yellow(`${totalMissions} `) + 'missions...');

        const progressBar = new cliProgress.SingleBar({
            format: `Missions: {mission}/${totalMissions} ` + colors.cyan('{bar}') + ' {percentage}% | Name: {name} | ' + '{message}',
            fps: 5,
            barCompleteChar: '\u2588',
            barIncompleteChar: '\u2591',
            hideCursor: true
        }, cliProgress.Presets.rect);

        progressBar.start(100, 0, { mission: 0, name: '', message: '' });

        let count = 0;
        let progressBarWasStopped = false;
        let message;

        // Go over the mission list and upload them.
        for (const m of config) {
            try {

                message = 'uploading...';
                if (progressBarWasStopped) {
                    progressBar.start(100, count, { mission: count, name: m.name, message: colors.green(message) });
                    progressBarWasStopped = false;
                }

                progressBar.update(Number((count / totalMissions * 100.0).toFixed(0)), {
                    mission: colors.green(count.toString()),
                    name: m.name,
                    message: colors.green('uploading...')
                });

                const res = await uploadMission(m, ev => {
                    message = ev.message;
                    progressBar.update(Number((count / totalMissions * 100.0).toFixed(0)), {
                        mission: colors.green(count.toString()),
                        name: m.name,
                        message: colors.magenta(message)
                    });
                });
                count++;

                progressBar.update(Number((count / totalMissions * 100.0).toFixed(0)), {
                    mission: colors.green(count.toString()),
                    name: m.name,
                    message: message === 'uploading...' ? colors.green('done.') : colors.magenta(message)
                });

                await new Promise(r => setTimeout(r, 1000));

                if (message != 'uploading...') {
                    progressBar.stop();
                    progressBarWasStopped = true;
                }

            } catch (error) {
                progressBar.stop();
                console.log(colors.red('Mission upload error: ') + `${error.message}`);
                count++;
                progressBarWasStopped = true;
            }
        }

        progressBar.stop();
        console.log(colors.green('Upload Complete'));
        resolve();
    })
}


/**
 * Upload one mission
 */
async function uploadMission(mission, cb) {

    return new Promise(async (resolve, reject) => {
        try {

            // Make sure no forward slash is in the mission names
            mission.name = mission.name.replace(/\//g, '-');
       
            if (mission.sensors && Array.isArray(mission.sensors) && mission.sensors.length > 0) {

                mission.sensors.forEach(s => s.name = s.name.replace(/\//g, '-'));
            }

            // Create mission
            const ret = await axios.post(
                `${server}/api/missions`, mission, {
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity,
                    headers: { 'Authorization': `Basic ${token}` }
            });

            const mi = ret.data.mission;

            // Upload sensors and start processing 
            const sensors = mission.sensors;
            if (sensors && Array.isArray(sensors) && sensors.length > 0) {
                sensors.forEach(async s => {
                    
                    let files = s.assets ? s.assets : s.files; 
                    
                    if(!Array.isArray(files) && files && files.length > 0 ) {
                        files = splitToArray(files);
                    }

                    // Check if the file exists. First, check the local machine and upload, if found. If not, just pass the path, so the server would try to locate it at its end.
                    const form_data = new FormData();

                    files.forEach(f => {
                        if (fs.existsSync(f)) {
                            form_data.append("files", fs.createReadStream(f));
                        }
                        else {
                            if (cb)
                                cb({ message: `file ${f} was not found locally. Will try to locate it on the server` })
                            //   console.log(colors.magenta(`\nfile ${f} was not found locally. Will try to locate it on the server`));
                            form_data.append("serverLocatedFiles", f);
                        }
                    });

                    let config = {
                        onUploadProgress: progressEvent => {
                            let percentCompleted = Math.floor((progressEvent.loaded * 100) / progressEvent.total);
                        }
                    }

                    // Make sure no forward slash is in the sensor names                  
                    axios({
                        method: 'post',
                        url: `${server}/api/missions/upload/${mi.name}/${s.name}?processAfterUpload=addToProcessingQueue`,
                        data: form_data,
                        maxContentLength: Infinity,
                        maxBodyLength: Infinity,
                        headers: {
                            'Authorization': `Basic ${token}`,
                            'Content-Type': 'multipart/form-data; boundary=' + `${form_data._boundary}`
                        },
                        maxContentLength: Infinity,
                        onUploadProgress: progressEvent => {
                            //         const progress = ((progressEvent.loaded / progressEvent.total) * 100).toFixed(0);

                        }
                    })
                        .then(res => {
                            //console.log('Upload complete');
                            resolve();
                        })
                        .catch(error => {
                            const err = new Error(`Upload failed - ${error.message}. ${error.response ? error.response.data : ''}`)
                            reject(err)
                        })
                })
            }
        } catch (error) {
            const err = new Error(`${error.message}. ${error.response ? error.response.data : ''}`)
            reject(err)
        }
    })
}


/**
 * Do all missions processing. Process missions one by one
 */
async function processAllMissions(config) {

    return new Promise(async (resolve, reject) => {

        let progressBar;

        axios({
            method: 'put',
            url: `${server}/api/missions/process`,
            headers: {
                'Authorization': `Basic ${token}`
            },
        })
            .then(async res => {

                const totalMissions = config.length;
                let totalTasks = res.data.tasks;
                let totalClipSegments;
                let processedSegments = 0;
                let ingestedSegments = 0;
                let count = 0;
                let progressMessage = '';
                let operationType = 'Processing';
                let detectedStreamInfo;

                console.log('Process ' + colors.yellow(`${totalMissions} `) + 'missions. Processing tasks scheduled at server: ' + colors.yellow(`${totalTasks} `));

                progressBar = new cliProgress.SingleBar({
                    format: `Missions: {task}/${totalTasks} ` + colors.cyan('{bar}') + ' {percentage}% | Segments: {segments}:{ingested} | {operation}: {name} | ' + '{message}',
                    fps: 15,
                    barCompleteChar: '\u2588',
                    barIncompleteChar: '\u2591',
                    hideCursor: true
                }, cliProgress.Presets.rect);

                processingEvents.addListener('processing', info => {

                    if (!info.queueEmpty) {
                        if (info.type) {

                            let segmentName;
                            switch (info.type) {

                                case 'hlsDetection':
                                    detectedStreamInfo = info.value;
                                    operationType = 'Processing';
                                    progressMessage = colors.magenta('detecting...');
                                    totalClipSegments = undefined;
                                    break;

                                case 'hlsProcessing':
                                    if (totalClipSegments === undefined)
                                        totalClipSegments = Math.round(info.value.sourceDuration / info.value.segmentDuration) + 1;

                                    processedSegments++;
                                    segmentName = path.basename(info.value.path);
                                    operationType = 'Processing';
                                    progressMessage = colors.brightBlue(`${info.value.totalSegments}/${totalClipSegments}`);
                                    break;

                                case 'hlsProcessingComplete':
                                    progressMessage = colors.brightBlue('Hls processing complete');
                                    segmentName = '';
                                    break;

                                case 'ingest_progress':
                                    operationType = 'Ingesting';
                                    ingestedSegments++;
                                    totalClipSegments = info.value.totalSegments; // Now we know for sure...
                                    progressMessage = colors.brightBlue(`${info.value.currentIndex}/${info.value.totalSegments}`);
                                    segmentName = path.basename(info.value.segmentName);
                                    break;

                                case 'ingest_complete':
                                    count++;
                                    segmentName = '';
                                    break;

                                case 'areaCalculation':
                                    operationType = 'Area Calc';

                                    if (info.value.phase === 'start')
                                        progressMessage = colors.magenta('calculating...');
                                    else {
                                        segmentName = `${info.value.area.toFixed(1)} sq. km`
                                        progressMessage = colors.green('complete.');
                                    }

                                    break;

                                default:
                                    break;
                            }

                            progressBar.update(Number((count / totalTasks * 100.0).toFixed(0)), {
                                task: colors.green(count.toString()),
                                segments: processedSegments,
                                ingested: ingestedSegments,
                                operation: operationType,
                                name: segmentName || '',
                                message: progressMessage
                            });
                        }
                    }
                    else {
                        progressBar.update(Number((count / totalTasks * 100.0).toFixed(0)), {
                            task: colors.green(count.toString()),
                            operation: 'Processing',
                            name: 'Complete',
                            segments: processedSegments,
                            ingested: ingestedSegments,
                            message: info.message ? colors.magenta(info.message) : colors.green('done')
                        });
                        progressBar.stop();
                        console.log(`Processed ${colors.yellow(processedSegments)} segments. Ingested ${colors.yellow(ingestedSegments)}`);
                        resolve();
                    }
                });

                progressBar.start(100, 0, { task: 0, segments: 0, ingested: 0, name: '', operation: 'Processing', message: '' });

            })
            .catch(error => {
                const err = new Error(`Processing failed - ${error.message}. ${error.response ? error.response.data : ''}`)
                progressBar.stop();
                reject(err)
            })
    })
}


/**
 * Parse command line args
 */
function parseArguments() {
    try {
        parser = new argparse.ArgumentParser({ add_help: true, description: 'Uploader', epilog: 'Start Uploader...' });
        parser.add_argument('-i', '--input', { metavar: '', help: 'Input configuration file path' });
        parser.add_argument('-s', '--server', { metavar: '', help: 'Server url' });
        parser.add_argument('-u', '--user', { metavar: '', help: 'User name' });
        parser.add_argument('-p', '--password', { metavar: '', help: 'Password' });
        parser.add_argument('--printUsage', { metavar: '', default: 'false', help: 'Print args description (true/false)' });
        parser.add_argument('-v', '--version', { metavar: '', help: 'Version' });

        argv = parser.parse_args();
        if (JSON.parse(argv.printUsage.trim()))
            parser.printHelp();
    } catch (error) {
        console.log(colors.red(`Argument parse error: ${error.message}\n`));
    }
}


cleanup(() => {
    process.stderr.write('\x1B[?25h') // Show terminal cursor
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
    process.on('exit', () => {
        process.emit('cleanup');
    });

    // catch ctrl+c event and exit normally
    process.on('SIGINT', () => {
        // console.log('warn', 'Ctrl-C...');  
        process.exit(2);
    });

    // catch terminate and exit normally
    process.on('SIGTERM', () => {
        // console.log('warn', 'Terminated...');
        process.exit(2);
    });

    // catch terminate and exit normally
    process.on('SIGQUIT', () => {
        // console.log('warn', 'Quit...'); 
        process.exit(2);
    });

    //catch uncaught exceptions, trace, then exit normally
    process.on('uncaughtException', e => {
        console.log('error', 'Uncaught Exception...');
        console.log(e.stack);
        process.exit(99);
    });
};