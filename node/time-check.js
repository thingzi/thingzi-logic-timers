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
        this.onoffset = config.onoffset;
        this.onrandom = config.onrandomoffset;

        // OFF config params
        this.offtype = config.offtype;
        this.offvalue = config.offtype === 'sun' ? config.offtimesun : config.offtimetod;
        this.offoffset = config.offoffset;
        this.offrandom = config.offrandomoffset;

        // Create an event
        function getEvent(type, value, offset, random) {
            var event = null;
            if (type === 'sun') {
                const sunCalcTimes = suncalc.getTimes(new Date(), node.lat, node.lon);
                var sc = sunCalcTimes[sunTimes[sunTimes.indexOf(value)]];
                if (sc && moment(sc).isValid()) {
                    event = moment(sc);
                } else {
                    node.error('Unable to determine time for \'' + value + '\'');
                }
            } else {
                // Parse time of day and store using server time zone
                var parts = value.split(':');
                var hours = parts.length > 0 ? parseInt(parts[0]) : NaN;
                var mins = parts.length > 1 ? parseInt(parts[1]) : NaN;
                var secs = parts.length > 2 ? parseInt(parts[2]) : NaN;

                // Validate time values
                if (!isNaN(hours) && (hours < 0 || hours > 60)) {
                    node.error('Invalid hours \'' + hours + '\'');
                } else if (!isNaN(mins) && (mins < 0 || mins > 60)) {
                    node.error('Invalid minutes \'' + mins + '\'');
                } else if (!isNaN(secs) && (secs < 0 || secs > 60)) {
                    node.error('Invalid seconds \'' + secs + '\'');
                } else if (!isNaN(secs)) {
                    event = moment().set({hour:hours,minute:mins,second:secs,millisecond:0});
                } else if (!isNaN(mins)) {
                    event = moment().set({hour:hours,minute:mins,second:0,millisecond:0});
                } else {
                    node.error('Invalid time \'' + value + '\'');
                }
            }

            if (event) {
                // Add the offset with random element (must be last to avoid multiple triggers for same period)
                if (offset) {
                    let adjustment = offset;
                    if (random) {
                        adjustment = offset * Math.random();
                    }
                    event.add(adjustment, 'minutes');
                }
            }

            return event;
        }

        // On input send the message
        this.on("input", function(msg, send, done) {
            let now = msg.hasOwnProperty('time') ? moment(msg.time) : moment();
            let check = false;

            // Is the day valid?
            if (!weekdays[now.isoWeekday() - 1]) {
                check = config.passunchecked === true;
            } else {
                // Check the range
                let on = getEvent(node.ontype, node.onvalue, node.onoffset, node.onrandom);
                let off = getEvent(node.offtype, node.offvalue, node.offoffset, node.offrandom);
                let flipped = on.isAfter(off);

                if (flipped) {
                    check = now.isAfter(on) || now.isBefore(off);
                } else {
                    check = now.isAfter(on) && now.isBefore(off);
                }
            }

            if (check) {
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
