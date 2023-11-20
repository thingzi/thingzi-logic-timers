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

    RED.nodes.registerType('thingzi-activity', function(config) {
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
        this.timerduration = config.timerduration * 1000;
        this.extendtimer = config.extendtimer;
        this.triggervalue = config.triggervalue;
        this.resetvalue = config.resetvalue;
        this.limitactivity = config.limitactivity;
        this.passunchecked = config.passunchecked;

        // START config
        this.starttype = config.ontype;
        this.startvalue = config.ontype === 'sun' ? config.ontimesun : config.ontimetod;
        this.startvaluetype = config.ontimetodtype || 'str';
        this.startoffset = config.onoffset;
        this.startrandom = config.onrandomoffset;

        // END config
        this.endtype = config.offtype;
        this.endvalue = config.offtype === 'sun' ? config.offtimesun : config.offtimetod;
        this.endvaluetype = config.offtimetodtype || 'str';
        this.endoffset = config.offoffset;
        this.endrandom = config.offrandomoffset;

        // Timer
        this.timer = null;

        // Disable override
        this.disabled = false;

        // Show error message on the node and the node red console log
        function setError(text) {
            node.error(text);
            node.status({ fill: 'red', shape: 'dot', text: text });
        }

        // Parse a string of the format HH:mm:ss where seconds are optional
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
            if (!isNaN(hours) && (hours < 0 || hours >= 24)) {
                throw `Invalid hours '${hours}'`;
            } else if (!isNaN(mins) && (mins < 0 || mins >= 60)) {
                throw `Invalid minutes '${mins}'`;
            } else if (!isNaN(secs) && (secs < 0 || secs >= 60)) {
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

            // Message may override these so assign to defaults
            let startType = node.starttype;
            let startValue = node.startvalue;
            let startValueType = node.startvaluetype;
            let endType = node.endtype;
            let endValue = node.endvalue;
            let endValueType = node.endvaluetype;

            // Handle disabled
            if (msg.hasOwnProperty('disable')) {
                node.disabled = msg.disable.toString() === 'ON';
                if (node.disabled) {
                    if (node.timer) {
                        clearTimeout(node.timer);
                        node.timer = null;
                    }
                    node.status({ fill: 'grey', shape: 'dot', text: 'disabled' });
                } else {
                    node.status({});
                }
            }

            if (node.disabled) {
                done();
                return;
            }

            // Use time now or allow override with a timestamp
            let nowTime = moment();
            var value = msg.hasOwnProperty('payload') ? msg.payload.toString() : null;

            // Handle reset
            if (msg.hasOwnProperty('reset') || (node.resetvalue !== '' && value === node.resetvalue)) {
                if (node.timer) {
                    clearTimeout(node.timer);
                    node.timer = null;
                }
                node.status({});
            }

            // Make sure we act on messages with trigger value
            if (value != node.triggervalue) {
                done();
                return;
            }

            // Is starttime in message using HH:mm
            if (msg.hasOwnProperty('starttime')) {
                startType = 'tod';
                startValue = msg.starttime;
                startValueType = 'str';
            }

            // Is endtime in message using HH:mm
            if (msg.hasOwnProperty('endtime')) {
                endType = 'tod';
                endValue = msg.endtime;
                endValueType = 'str';
            }

            // Default to not passing check
            let passCheck = false;

            // Is the day valid?
            if (node.limitactivity === false){
                passCheck = weekdays[nowTime.isoWeekday() - 1] === true;
            } else if (!weekdays[nowTime.isoWeekday() - 1]) {
                passCheck = config.passunchecked === true;
            } else {
                // Check the range
                let startTime = undefined;
                let endTime = undefined;
                
                try {
                    startTime = getEventTime(startType, startValue, startValueType, node.startoffset, node.startrandom);
                } catch (error) {
                    setError(`ON: ${error}`);
                    done();
                    return;
                }

                try {
                    endTime = getEventTime(endType, endValue, endValueType, node.endoffset, node.endrandom);
                } catch (error) {
                    setError(`OFF: ${error}`);
                    done();
                    return;
                }

                let flipped = startTime.isAfter(endTime);
                if (flipped) {
                    passCheck = nowTime.isSameOrAfter(startTime) || nowTime.isBefore(endTime);
                } else {
                    passCheck = nowTime.isSameOrAfter(startTime) && nowTime.isBefore(endTime);
                }
            }

            // Initial update
            if (passCheck) {
                if (node.timer) {
                    if (node.extendtimer) {
                        clearTimeout(node.timer);
                        node.timer = null;
                    } else {
                        done(); // no extension
                        return;
                    }
                } else {
                    node.send({ payload: "ON"});
                    node.status({ fill: 'green', shape: 'dot', text: `@ ${nowTime.format(fmt)}` });
                }

                node.timer = setTimeout(function() {
                    node.send({ payload: "OFF"});
                    node.status({ fill: 'grey', shape: 'dot', text: `@ ${moment().format(fmt)}` });
                    node.timer = null;
                }, node.timerduration);
            }

            done();
        });
    });
};
