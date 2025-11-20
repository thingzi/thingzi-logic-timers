# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Node-RED custom nodes package (`thingzi-logic-timers`) providing time-based automation nodes:
- **Timer** - Daily on/off timer with fixed times or sun events
- **Time Check** - Tests if current time is within a range
- **Schedule** - Weekly visual calendar scheduler
- **Activity** - Time-based activity events with timeouts

## Development

### Installation
```bash
cd node
npm install
```

### Testing Locally
The `test/` directory contains a Node-RED project for local testing. To test your nodes:

1. Install Node-RED globally or use the test project
2. Link the node package to your Node-RED installation
3. Configure `test/settings.js` to point `nodesDir` to the `node/` directory

### Package Structure
- `node/` - Main package with custom nodes
  - `*.js` - Node logic (timer.js, time-check.js, schedule.js, activity.js)
  - `*.html` - Node editor UI and help text
  - `package.json` - Package manifest with node-red node definitions
- `test/` - Local Node-RED test environment
- `docs/` - Documentation and images

## Architecture

### Node-RED Node Pattern
Each node follows the standard Node-RED pattern:
- Exports a function receiving the `RED` runtime object
- Registers node type with `RED.nodes.registerType()`
- HTML file contains three `<script>` sections: registration, editor template, help text

### Key Dependencies
- **moment** - Date/time manipulation
- **suncalc** - Sun position and event calculations (sunrise, sunset, etc.)
- **lodash** - Utility functions
- **needle** - HTTP client for geolocation API calls

### Sun Events
Nodes support these suncalc events: solarNoon, goldenHourEnd, goldenHour, sunriseEnd, sunsetStart, sunrise, sunset, dawn, dusk, nauticalDawn, nauticalDusk, nightEnd, night, nadir
