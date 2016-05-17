/*
 * Abstraction layer for .json configuration files.
 */

"use strict";

var fs = require("fs"),
	get = require("lodash.get"),
	set = require("lodash.set");

module.exports = class Config {
	// Create a new config object, and start loading/parsing it. Checks for
	// sample & creates if necessary, then calls callback.
	constructor(path, callback) {
		this.data = false;
		this.sample = false;
		this.path = path;

		var completed = 0,
			onComplete = () => {
				completed++;

				if(completed === 2) {
					if(this.sample && !this.data) {
						console.log("Creating default configuration from sample...");
						this.data = this.sample;
						this.save();
					}

					callback(this.data);
				}
			};


		fs.readFile(path, 'utf8', (err, data) => {
			try {
				this.data = JSON.parse(data);
			} catch(e) {}

			onComplete();
		});

		fs.readFile(path.replace(new RegExp('.json$'), '.sample.json'), 'utf8', (err, data) => {
			try {
				this.sample = JSON.parse(data);
			} catch(e) {}

			onComplete();
		});
	}

	// Get a config file, or the sample value if it is not set.
	get(key) {
		var exists = get(this.data, key);

		return exists ? exists : get(this.sample, key);
	}

	// Sets a config value. Synchronous to prevent collision.
	set(key, value) {
		set(this.data, key, value);

		return this.save();
	}

	// Write current configuration to disk.
	save() {
		try {
			fs.writeFileSync(this.path, JSON.stringify(this.data, null, "\t"));

			return true;
		} catch(e) {
			return false;
		}
	}
};