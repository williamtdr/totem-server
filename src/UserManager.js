"use strict";

var User = require("./class/User"),
	utils = require("./utils"),
	database = require("./database");

var users = {};

var iterate = (cb) => {
	for(var user_id in users)
		cb(users[user_id]);
};

module.exports = {
	users: users,
	revokeKey: (key) => {
		database.connection.query('DELETE FROM `chatkeys` WHERE `auth` = ' + database.connection.escape(key));
	},
	login: (callback, key, connection) => {
		if(users[key])
			return callback(users[key]);

		var user = new User();
		user.connection = connection;
		user.key = key;
		
		if(key === "unauthenticated") {
			var guest_key = "guest-" + utils.randomString(20);
			key = guest_key;
			
			user.name = "Guest";
			user.key = guest_key;
			user.guest = true;
			
			user.send({
				event: "guest_key",
				data: guest_key
			});

			users[key] = user;
			callback(user);
		} else {
			var regexp = /^[a-zA-Z0-9-]+$/;
			if(user.key.search(regexp) === -1)
				return false;

			database.connection.query('SELECT `display_name`,`id` FROM `chatkeys` WHERE `auth` = \'' + key + '\'', (err, rows) => {
				if(err || rows.length !== 1) return;

				var query_data = rows[0];

				user.name = query_data.display_name;
				user.id = query_data.id;

				if(user.profile && user.profile.bio) {
					user.send({"event": "profile_update", "data": user.profile});

					users[key] = user;
					callback(user);
				} else database.connection.query('SELECT * FROM `profiles` WHERE `id` = \'' + query_data.id + '\'', (err, rows) => {
					if(!err && rows.length === 1) {
						user.profile = {
							bio: rows[0].bio,
							twitter: rows[0].twitter,
							steam: rows[0].steam,
							website: rows[0].website,
							profile_picture: rows[0].profile_picture,
							display_name: rows[0].display_name
						};
						user.send({"event": "profile_update", "data": user.profile});
					}

					users[key] = user;
					callback(user);
				});
			});
		}
	},
	getProfile: (callback, name) => {
		var profile = false;

		database.connection.query('SELECT * FROM `profiles` WHERE `display_name` = ' + database.connection.escape(name), (err, rows) => {
			if(!err && rows.length === 1) {
				profile = {
					bio: rows[0].bio,
					twitter: rows[0].twitter,
					steam: rows[0].steam,
					website: rows[0].website,
					profile_picture: rows[0].profile_picture,
					display_name: rows[0].display_name
				};
			}

			callback(profile);
		});
	},
	getByKey: (key) => {
		return users[key] || false;
	},
	getByIdIterator: (id) => {
		var results = [];

		iterate((user) => {
			if(user.id === id)
				results.push(user);
		});

		return results;
	},
	getByConnection: (connection) => {
		var results = [];

		iterate((user) => {
			if(user.connection === connection)
				results.push(user);
		});

		return results;
	},
	getByRoom: (roomId) => {
		var results = [];

		iterate((user) => {
			if(user.room === roomId)
				results.push(user);
		});

		return results;
	}
};