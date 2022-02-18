module.exports = function(RED) {
    'use strict';

    const moment = require('moment');
    const suncalc = require('suncalc');
    const sunTimes = [
        "solarNoon",
        "goldenHourEnd",
        "goldenHour",
        "sunriseEnd",
        "sunsetStart",
        "sunrise",
        "sunset",
        "dawn",
        "dusk",
        "nauticalDawn",
        "nauticalDusk",
        "nightEnd",
        "night",
        "nadir"
    ];

    RED.nodes.registerType('thingzi-time-check', function(config) {
        RED.nodes.createNode(this, config);
        const node = this

        const weekdays = [
            config.mon,
            config.tue,
            config.wed,
            config.thu,
            config.fri,
            config.sat,
            config.sun
        ];

        var fmt = 'D MMM, HH:mm:ss';
        this.lat = config.lat;
        this.lon = config.lon;
        this.passunchecked = config.passunchecked;

        // ON config
        this.ontype = config.ontype;
        this.onvalue = config.ontype === 'sun' ? config.ontimesun : config.ontimetod;
        this.onvaluetype = config.ontimetodtype || 'str';
        this.onoffset = config.onoffset;
        this.onrandom = config.onrandomoffset;

        // OFF config params
        this.offtype = config.offtype;
        this.offvalue = config.offtype === 'sun' ? config.offtimesun : config.offtimetod;
        this.offvaluetype = config.offtimetodtype || 'str';
        this.offoffset = config.offoffset;
        this.offrandom = config.offrandomoffset;

        function setError(text) {
            node.error(text);
            node.status({ fill: 'red', shape: 'dot', text: text });
        }

        function parseTime(value) {
            if (!value) {
                throw 'Time not set';
            }

            // Parse time of day and store using server time zone
            var parts = value.split(':');
            var hours = parts.length > 0 ? parseInt(parts[0]) : NaN;
            var mins = parts.length > 1 ? parseInt(parts[1]) : NaN;
            var secs = parts.length > 2 ? parseInt(parts[2]) : NaN;

            // Validate time values
            if (!isNaN(hours) && (hours < 0 || hours > 60)) {
                throw `Invalid hours '${hours}'`;
            } else if (!isNaN(mins) && (mins < 0 || mins > 60)) {
                throw `Invalid minutes '${mins}'`;
            } else if (!isNaN(secs) && (secs < 0 || secs > 60)) {
                throw `Invalid seconds '${secs}'`;
            } else if (!isNaN(secs)) {
                return moment().set({hour:hours,minute:mins,second:secs,millisecond:0});
            } else if (!isNaN(mins)) {
                return moment().set({hour:hours,minute:mins,second:0,millisecond:0});
            }

            throw `Invalid time '${value}'`;
        }

        // Get the event time
        function getEventTime(type, value, valuetype, offset, random) {
            if (!value) {
                return undefined;
            }

            var eventTime = undefined;
            if (type === 'sun') {
                const sunCalcTimes = suncalc.getTimes(new Date(), node.lat, node.lon);
                var sc = sunCalcTimes[sunTimes[sunTimes.indexOf(value)]];
                if (sc && moment(sc).isValid()) {
                    eventTime = moment(sc);
                } else {
                    throw `Sun calc error '${value}'`;
                }
            } else if (type === 'tod') {
                switch(valuetype) {
                    case 'str':
                        eventTime = parseTime(value); 
                        break;
                    case 'flow': 
                        let fvalue = node.context().flow.get(value);
                        if (!fvalue) {
                            throw `flow.${value} not found`;
                        }
                        eventTime = parseTime(fvalue); 
                        break;
                    case 'global': 
                        let gvalue = node.context().global.get(value);
                        if (!gvalue) {
                            throw `global.${value} not found`;
                        }
                        eventTime = parseTime(gvalue); 
                        break;
                }
            }

            if (eventTime) {
                // Add the offset with random element (must be last to avoid multiple triggers for same period)
                if (offset) {
                    let adjustment = offset;
                    if (random) {
                        adjustment = offset * Math.random();
                    }
                    eventTime.add(adjustment, 'minutes');
                }
            }

            return eventTime;
        }

        // On input send the message
        this.on("input", function(msg, send, done) {
            // Use time now or allow override with a timestamp
            let now = msg.hasOwnProperty('time') ? moment(msg.time) : moment();
            let ontype = node.ontype;
            let onvalue = node.onvalue;
            let onvaluetype = node.onvaluetype;
            let offtype = node.offtype;
            let offvalue = node.offvalue;
            let offvaluetype = node.offvaluetype;

            // Different way to override current time using HH:mm
            if (msg.hasOwnProperty('nowtime')) {
                try {
                    now = parseTime(msg.nowtime);
                } catch (e) {
                    setError(e);
                    done();
                    return;
                }
            }

            // Is ontime in message using HH:mm
            if (msg.hasOwnProperty('ontime')) {
                ontype = 'tod';
                onvalue = msg.ontime;
                onvaluetype = 'str';
            }

            // Is offtime in message using HH:mm
            if (msg.hasOwnProperty('offtime')) {
                offtype = 'tod';
                offvalue = msg.ontime;
                offvaluetype = 'str';
            }

            let passTest = false;

            // Is the day valid?
            if (!weekdays[now.isoWeekday() - 1]) {
                passTest = config.passunchecked === true;
            } else {
                // Check the range
                let on = undefined;
                let off = undefined;
                
                try {
                    on = getEventTime(ontype, onvalue, onvaluetype, node.onoffset, node.onrandom);
                } catch (error) {
                    setError(`ON: ${error}`);
                    done();
                    return;
                }

                try {
                    off = getEventTime(offtype, offvalue, offvaluetype, node.offoffset, node.offrandom);
                } catch (error) {
                    setError(`OFF: ${error}`);
                    done();
                    return;
                }

                let flipped = on.isAfter(off);
                if (flipped) {
                    passTest = now.isSameOrAfter(on) || now.isBefore(off);
                } else {
                    passTest = now.isSameOrAfter(on) && now.isBefore(off);
                }
            }

            if (passTest) {
                node.send([msg, null]);
                node.status({ fill: 'green', shape: 'dot', text: `@ ${now.format(fmt)}` });
            } else {
                node.send([null, msg]);
                node.status({ fill: 'grey', shape: 'dot', text: `@ ${now.format(fmt)}` });
            }
            done();
        });
    });
};
