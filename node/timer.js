module.exports = function(RED) {
    'use strict';

    const moment = require('moment');
    const needle = require('needle');
    const suncalc = require('suncalc');
    const lodash = require('lodash');
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

    RED.nodes.registerType('thingzi-timer', function(config) {
        RED.nodes.createNode(this, config);
        const node = this

        let fmt = 'D MMM, HH:mm:ss';
        let events = {};

        const weekdays = [
            config.mon,
            config.tue,
            config.wed,
            config.thu,
            config.fri,
            config.sat,
            config.sun
        ];

        // Create an event
        function createEvent(eventName, color, statusCallback) {
            const filtered = lodash.pickBy(config, function(value, key) {
                return key && key.indexOf(eventName) === 0;
            });
            const event = lodash.mapKeys(filtered, function(value, key) {
                return key.substring(eventName.length).toLowerCase();
            });

            event.name = eventName.toUpperCase();
            event.color = color;
            event.state = (eventName === 'on');
            event.last = { moment: null };
            event.statusCallback = statusCallback;
            event.offset = Math.max(-180, event.offset);
            event.offset = Math.min(180, event.offset);

            // Callback for the event trigger
            event.timerCallback = function() {
                // Handle case when timeout is triggered early (have seen this up to 10s over longer period)
                let now = moment();
                let evm = event.moment;
                if (evm && evm.isAfter(now)) {
                    event.clear(); //< clears event.moment
                    event.moment = evm;
                    event.timeout = setTimeout(event.timerCallback, Math.max(evm.diff(now) + 100, 100));
                }
                else
                {
                    // send the event
                    event.send();
                    event.schedule();
                    event.statusCallback();
                }
            };

            // Get value in selected format
            event.getValue = function(ctx) {
                let tgtValue = event.value;
                switch (event.valuetype) {
                    case 'flow':
                        tgtValue = ctx.flow.get(tgtValue);
                        break;
                    case 'global':
                        tgtValue = ctx.global.get(tgtValue);
                        break;
                    case 'json':
                        tgtValue = JSON.parse(tgtValue);
                        break;
                    case 'bool':
                        tgtValue = (tgtValue === "true");
                        break;
                    case 'date':
                        tgtValue = (new Date()).getTime();
                        break;
                    case 'num':
                        tgtValue = parseFloat(tgtValue);
                        break;
                }
                return tgtValue;
            };

            // Send the event message
            event.send = function() {
                node.log(`Send ${event.name} event, value = ${event.value}`); //verbose
                event.last.moment = moment();

                // Output value
                var ctx = node.context();
                switch (event.propertytype) {
                    case "flow":
                        ctx.flow.set(event.property, event.getValue(ctx));
                        break;
                    case "global":
                        ctx.global.set(event.property, event.getValue(ctx));
                        break;
                    case "msg":
                        let msg = {};
                        if (event.topic) msg.topic = event.topic;
                        let currPart = msg;
                        let spl = event.property.split('.');
                        for (let i in spl) {
                            if (i < (spl.length - 1)) {
                            if (!currPart[spl[i]]) currPart[spl[i]] = {};
                                currPart = currPart[spl[i]];    
                            } else {
                                currPart[spl[i]] = event.getValue(ctx);
                            }
                        }
                        node.send(msg);
                        break;
                }
            }

            event.calculateTime = function(date) {
                if (event.type === 'sun') {
                    const sunCalcTimes = suncalc.getTimes(date.toDate(), config.lat, config.lon);
                    let sc = sunCalcTimes[sunTimes[sunTimes.indexOf(event.timesun)]];
                    if (sc && moment(sc).isValid()) {
                        event.moment = moment(sc);
                    } else {
                        event.error = 'Unable to determine sun time for \'' + event.timesun + '\'';
                    }
                } else if (event.type === 'tod' && event.timetod && event.timetod !== '') {

                    // Parse time of day and store using server time zone
                    let parts = event.timetod.split(':');
                    let hours = parts.length > 0 ? parseInt(parts[0]) : NaN;
                    let mins = parts.length > 1 ? parseInt(parts[1]) : NaN;
                    let secs = parts.length > 2 ? parseInt(parts[2]) : NaN;

                    // Validate time values
                    if (!isNaN(hours) && (hours < 0 || hours >= 24)) {
                        event.error = 'Invalid hours \'' + event.timetod + '\'';
                    } else if (!isNaN(mins) && (mins < 0 || mins >= 60)) {
                        event.error = 'Invalid minutes \'' + event.timetod + '\'';
                    } else if (!isNaN(secs) && (secs < 0 || secs >= 60)) {
                        event.error = 'Invalid seconds \'' + event.timetod + '\'';
                    } else if (!isNaN(secs)) {
                        event.moment = moment(date).set({hour:hours,minute:mins,second:secs,millisecond:0});
                    } else if (!isNaN(mins)) {
                        event.moment = moment(date).set({hour:hours,minute:mins,second:0,millisecond:0});
                    } else {
                        event.error = 'Invalid time \'' + event.timetod + '\'';
                    }
                }

                // Add the offset
                if (event.moment && event.offset) {
                    event.moment.add(event.offset, 'minutes');
                }

                return event.moment;
            }

            // Schdule an event
            event.schedule = function() {
                event.clear();

                // Get the next day or exit if there is not one
                let date = getNextDate(new moment());
                if (!date) {
                    return;
                }

                // Calculate the time for the event
                if (!event.calculateTime(date)) {
                    return;
                }

                // Adjust to next valid day if event in the past
                let now = moment();
                if (now.isSameOrAfter(event.moment)) {
                    date = date.add(1, 'days');
                    if (!event.calculateTime(getNextDate(date))) {
                        return;
                    }
                }

                // Add random offset & handle case where new time is still within the offset
                if (event.offset && event.randomoffset) {
                    let baseTime = moment(event.moment).subtract(event.offset, 'minutes');
                    if (now.isSameOrAfter(baseTime)) {
                        date = date.add(1, 'days');
                        if (!event.calculateTime(getNextDate(date))) {
                            return;
                        }
                    }
                    event.moment.subtract(event.offset * Math.random(), 'minutes');
                }

                // Log event
                node.log("Scheduled '" + event.name + "' (" + event.type + ") for " + event.moment.toString());
                const delay = Math.max(event.moment.diff(now) + 100, 1000); //< Add 100ms to ensure its triggered after the time
                event.timeout = setTimeout(event.timerCallback, delay);
            }

            event.clear = function() {
                event.error = null;
                event.moment = null;

                if (event.timeout) {
                    clearTimeout(event.timeout);
                    event.timeout = null;
                }
            }

            // Schedule the event
            event.schedule();

            return event;
        }

        // Determine the next event
        function getNextEvent() {
            if (!events.on.moment) {
                return null;
            }

            // Is there an off event?
            if (events.off && events.off.moment) {
                if (events.off.moment.isAfter(events.on.moment)) {
                    return events.on;
                } else {
                    return events.off;
                }
            }

            return events.on;
        }

        // Determine the previous event
        function getPreviousEvent() {
            let nextEvent = getNextEvent();
            if (nextEvent === events.on && events.off) {
                return events.off;
            } else {
                return events.on;
            }
        }

        // Get the next valid date for the timer
        function getNextDate(date) {
            // Check for at least one weekday to protect against infinite loop
            let hasWeekday = false;
            for(let i=0; i<7; ++i) { 
                hasWeekday |= weekdays[i];
            }

            if (!hasWeekday) {
                return null;
            }

            // Work out next date
            let nextDate = new moment(date);
            while (!weekdays[nextDate.isoWeekday() - 1]) {
                nextDate.add(1, 'days');
            }

            return nextDate;
        }

        // Update the node status
        function updateStatus() {
            let next = getNextEvent();
            let prev = events.off ? getPreviousEvent() : null;

            if (next && next.error) {
                node.status({ fill: 'red', shape: 'dot', text: next.error });
            } else if (prev && prev.error) {
                node.status({ fill: 'red', shape: 'dot', text: prev.error });
            } else if (next && prev) {
                node.status({ fill: prev.color, shape: 'dot', text: `${prev.name} -> ${next.name} @ ${next.moment.format(fmt)}` });
            } else if (next) {
                node.status({ fill: next.color, shape: 'dot', text: `Trigger @ ${next.moment.format(fmt)}` });
            } else {
                node.status({ fill: 'red', shape: 'dot', text: 'No scheduled event' });
            }
        }

        // Node is closing down, clean up
        node.on('close', function() {
            if (events.off) {
                clearTimeout(events.off.timeout);
                events.off.moment = null;
            }

            clearTimeout(events.on.timeout);
            events.on.moment = null;
            updateStatus();
        });

        // Initialise timer & state
        switch (config.timerType) {
            case 'onoff':
                events.on = createEvent('on', 'green', updateStatus);
                events.off = createEvent('off', 'grey', updateStatus);
                break;
            case 'trigger':
                events.on = createEvent('on', 'green', updateStatus);
                events.off = null;
                break;
        }

        // Set initial state (after 0.1s)
        var previous = getPreviousEvent();
        if (previous) { 
            if (config.startupMessage) {
                setTimeout(function() { previous.send(); }, 100);
            }
        }

        // Update node status
        updateStatus();
    });

    // Rough location
    RED.httpAdmin.get('/thingzi/timer/location', RED.auth.needsPermission('thingzi.read'), function(req,res) {
        needle.get('https://www.iplocate.io/api/lookup', (err, result, data) => {
            if (err) {
                console.log('thingZi error: Could not fetch location, ', err);
                res.sendStatus(503);
            } else if (result.statusCode !== 200) {
                console.log('thingZi error: Could not fetch location, ', result.statusCode);
                res.sendStatus(result.statusCode);
            } else {
                res.json({
                    country: data.country,
                    country_code: data.country_code,
                    time_zone: data.time_zone,
                    latitude: data.latitude,
                    longitude: data.longitude
                });
            }
        });
    });
};
