"use strict";

var UserManager = require("./UserManager"),
	Room = require("./class/Room"),
	Song = require("./class/Song"),
	database = require("./database"),
	permission = require("./PermissionManager"),
	utils = require("./utils");

var rooms = {};

var iterate = (cb) => {
	for(var room_id in rooms)
		cb(rooms[room_id]);
};

module.exports = {
	rooms: rooms,
	get: (callback, id) => {
		var room = module.exports.getById(id);
		if(room)
			return callback(room);
		else module.exports.getFromDatabase(callback, id);
	},
	getById: (id) => {
		return rooms[id] || false;
	},
	getFromDatabase: (callback, id) => {
		var regexp = /^[a-zA-Z0-9-]+$/;

		if(id.search(regexp) === -1)
			return callback(false);

		if(rooms[id])
			return callback(rooms[id]);

		database.connection.query('SELECT * FROM `rooms` WHERE `id` = ' + database.connection.escape(id), (err, rows) => {
			if(rows && rows.length === 1) {
				var query_data = rows[0],
					room = new Room(query_data.id, query_data.display_name);

				room.description = query_data.description;
				room.icon = query_data.icon;

				permission.reload(query_data.id);
				permission.awaiting_permission_load[query_data.id] = [];

				if(query_data.password !== "false")
					room.password = query_data.password;
				else
					if(typeof query_data.song_name === "string" && query_data.song_name.length > 1) {
						room.song = new Song();

						room.song.name = query_data.song_name;
						room.song.artist = query_data.song_artist;
						room.song.source = query_data.song_source;
						room.song.url_fragment = query_data.url_fragment;
						room.song.started_at = query_data.song_started_at;
						room.song.picture_url = query_data.song_picture_url;
					}

				room.syncBackgrounds();

				rooms[query_data.id] = room;
				return callback(rooms[query_data.id]);
			}

			if(err)
				console.log(err);

			return false;
		});
	},
	tick: () => {
		iterate((room) => {
			room.tick();
		});
	},
	disconnect: (connection) => {
		if(!connection)
			return false;

		var success = false;
		
		var results = UserManager.getByConnection(connection);
		for(var user of results)
			if(user.room) {
				var currentRoom = module.exports.getById(user.room);

				if(currentRoom) {
					console.log("[User] ".yellow + (user.name + " from " + user.room + " disconnected.").white);
					currentRoom.sendChatMessage(">", "<span style=\"color:#BDC3C7\">" + user.name + " left the room</span>", false, true, "#3498DB", "#2980B9");
					UserManager.users[user.key].room = false;

					utils.removeEl(currentRoom.listeners, user.key);
					
					currentRoom.removeVote(user);
					currentRoom.listener_count--;
					currentRoom.updateUserCounter();

					utils.removeEl(currentRoom.listenerNames, user.name);
					currentRoom.updateUserList();

					success = true;
				}
			}

		return success;
	}
};