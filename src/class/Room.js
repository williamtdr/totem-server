"use strict";

var Song = require("./Song"),
	Score = require("./Score"),
	UserManager = require("../UserManager"),
	permission = require("../PermissionManager"),
	database = require("../database"),
	htmlencode = require('htmlencode');

module.exports = class Room {
	constructor(id, name) {
		this.id = id;
		this.name = name;
		this.description = "";
		this.song = false;
		this.score = new Score();
		this.current_dj = "";

		this.chat_history = [];
		this.listenerNames = [];
		this.backgrounds = false;
		this.listener_count = 0;
		this.icon = "http://static.totem.fm/default_notification.png";

		this.listeners = []; // single-dimensional list of keys, users currently connected to the room
		this.vote_log = []; // associative array of keys -> vote (+/-). Used to remove a vote when a user leaves a room and when they change it
		this.key = id; // allows for iterating over room list by id
		this.chat_counter = 0;
		this.password = false;
		this.next_queue_advance = Number.MAX_VALUE;
		this.queue = [];

		this.last_message = {
			text: "",
			sender: ""
		};
	}

	encode() {
		return {
			id: this.id,
			display_name: this.name,
			description: this.description,
			song: this.song,
			score: this.score,
			current_dj: this.current_dj,
			chat_history: this.chat_history,
			listeners_by_name: this.listenerNames,
			backgrounds: this.backgrounds,
			listener_count: this.listener_count,
			icon: this.icon
		};
	}

	add(user) {
		UserManager.users[user.key].room = this.id;

		if(permission.awaiting_permission_load[this.id])
			permission.awaiting_permission_load[this.id].push({connection: user.connection, id: user.id});

		if(permission.checkPermission(user.id, this.id, permission.PERMISSION_LEVEL_ROOM_QUEUE_BANNED))
			user.send({
				event: "permission", data: {type: "queue_ban_room"}
			});

		if(permission.getEffectivePermissionLevel(user.id, this.id) <= permission.EFFECTIVE_PERMISSION_LEVEL_ADMIN) {
			user.sendChatMessage("", '<span style="color: #2ECC71">Welcome! You have admin privileges in this room, check /help for a list of commands.</span>');
			user.send({
				event: "permission", data: {type: "room_admin"}
			});
		}

		if(permission.getEffectivePermissionLevel(user.id, this.id) === permission.EFFECTIVE_PERMISSION_LEVEL_HOST) {
			user.sendChatMessage("", '<span style="color: #2ECC71">Welcome! You have admin privileges in this room, check /help for a list of commands.</span>');
			user.send({
				event: "permission", data: {type: "room_host"}
			});
		}

		if(permission.checkPermission(user.id, this.id, permission.PERMISSION_LEVEL_SITE_QUEUE_BANNED))
			user.send({
				event: "permission", data: {type: "queue_ban_site"}
			});

		if(permission.checkPermission(user.id, this.id, permission.PERMISSION_LEVEL_ROOM_MUTED))
			user.send({
				event: "permission", data: {type: "muted_room"}
			});

		if(permission.checkPermission(user.id, this.id, permission.PERMISSION_LEVEL_SITE_MUTED))
			user.send({
				event: "permission", data: {type: "muted_site"}
			});

		if(permission.checkPermission(user.id, this.id, permission.PERMISSION_LEVEL_SITE_BANNED))
			return user.send({
				event: "permission", data: {type: "banned_site"}
			});

		if(permission.checkPermission(user.id, this.id, permission.PERMISSION_LEVEL_ROOM_BANNED))
			return user.send({
				event: "permission", data: {type: "banned_room"}
			});

		this.listeners.push(user.key);
		this.listenerNames.push(user.name);
		this.listener_count++;
		this.updateUserCounter();
		this.updateUserList();

		if(this.password)
			user.send({
				"event": "requires_authentication",
				"display_name": this.name
			});
		else user.send({
			event: "room_data",
			data: this.encode(),
			room: this.id
		});
		this.sendChatMessage(">", "<span style=\"color:#BDC3C7\">" + user.name + " joined the room</span>", false, true, "#3498DB", "#2980B9");

		var tmp_queue = [];
		for(var index in this.queue[user.id])  {
			var data = this.queue[user.id][index];

			tmp_queue.push({
				name: data.name,
				artist: data.artist,
				id: data.id,
				thumbnail: data.thumbnail,
				duration: data.duration,
				dj: data.dj
			});
		}

		if(tmp_queue.length > 0) user.send({
			event: "queue_update",
			data: tmp_queue
		});

		console.log("[User] ".yellow + (user.name + " connected to " + this.id + ".").white);
	}

	removeUserFromQueue(id) {
		if(this.queue[id])
			delete this.queue[id];
	}

	updateUserList() {
		this.broadcast({
			event: "user_list_change",
			data: this.listenerNames
		});
	}

	getOrderedQueue(append_id) {
		append_id = append_id || false;

		var queue_data = [],
			everyones_next_items = {};

		for(var user_id in this.queue) {
			var local_lowest_started_at = Number.MAX_VALUE,
				lowest_index = 0;

			if(this.queue[user_id].length == 0) {
				delete this.queue[user_id];
				break;
			}

			for(var data_index in this.queue[user_id]) {
				var data = this.queue[user_id][data_index];

				if(data.added_at < local_lowest_started_at) {
					local_lowest_started_at = data.added_at;
					lowest_index = data_index;
				}
			}

			if(local_lowest_started_at !== Number.MAX_VALUE) everyones_next_items[local_lowest_started_at] = this.queue[user_id][lowest_index];
		}

		var keys = Object.keys(everyones_next_items),
			i;

		keys.sort();

		for(i = 0; i < keys.length; i++) {
			var k = keys[i],
				item = everyones_next_items[k];

			var s = new Song();
			s.name = item.name;
			s.artist = item.artist;
			s.url_fragment = item.id;
			s.picture_url = item.thumbnail;
			s.duration = item.duration;

			if(append_id) {
				queue_data.push({
					song: s,
					dj: item.dj,
					id: item.dj_id
				});
			} else {
				queue_data.push({
					song: s,
					dj: item.dj
				});
			}
		}

		return queue_data;
	}

	updateUserCounter() {
		database.connection.query("UPDATE `rooms` SET `user_counter` = " + database.connection.escape(this.listener_count) + " WHERE `id` = " + database.connection.escape(this.id));
		this.broadcast({
			event: "user_counter_update",
			data: this.listener_count
		});
	}

	checkScore() {
		if(this.score.negative > (this.score.positive * 3))
			if(((this.score.positive) + (this.score.negative)) > 3) {
				this.sendNotification(this.current_dj + "'s song was skipped based on community vote.", "error");
				this.advanceQueue();
			}
	}

	removeSongFromQueue(user_id, song_id) {
		if(this.queue[user_id]) {
			for(var index in this.queue[user_id]) {
				var queue_item = this.queue[user_id][index];
				if(queue_item.id === song_id) {
					delete this.queue[user_id][index];

					var tmp_queue = [];
					for(var index2 in this.queue[user_id])  {
						var data = this.queue[user_id][index2];
						tmp_queue.push({
							name: data.name,
							artist: data.artist,
							id: data.id,
							thumbnail: data.thumbnail,
							duration: data.duration,
							dj: data.dj
						});
					}
					queue_item.connection.send(JSON.stringify({
						event: "queue_update",
						data: tmp_queue
					}));
				}
			}

			if(this.queue[user_id].length === 0)
				delete this.queue[user_id];
		}
	}

	updateQueueList() {
		var data = this.getOrderedQueue();

		if(!data || data.length === 0)
			this.queue = [];

		this.broadcast({
			event: "queue_change",
			data: data
		});
	}

	// Remove a user's vote when they leave a room
	removeVote(user) {
		var listener_id = user.key;

		if(this.vote_log[listener_id] === undefined)
			return false;

		if(this.vote_log[listener_id])
			this.score.positive -= 1;
		else this.score.negative -= 1;

		delete this.vote_log[listener_id];

		this.sendScore();
	}

	advanceQueue() {
		var ordered_queue = this.getOrderedQueue(true);

		if(ordered_queue.length > 0) {
			if(this.current_dj.length > 0) this.sendNotification(this.current_dj + " got " + this.score.positive + " upvotes and " + this.score.negative + " downvotes.", "warning");
			ordered_queue[0].song.started_at = Math.floor(Date.now() / 1000);
			this.song = ordered_queue[0].song;
			this.current_dj = ordered_queue[0].dj;

			this.broadcast({
				event: "song_change",
				data: {
					song: this.song,
					dj: this.current_dj
				},
				room: this.id
			});

			console.log("[Song] ".green + (this.current_dj).white + (' is playing ').gray + (this.song.artist).white + ' - '.gray + (this.song.name).white);

			database.connection.query("UPDATE `rooms` SET `song_name`='" + this.song.name + "',`song_artist`='" + this.song.artist + "',`song_started_at`='" + this.song.started_at + "',`song_url_fragment`='" + this.song.url_fragment + "',`song_source`='" + this.song.source + "',`song_picture_url`='" + this.song.picture_url + "' WHERE `id`='" + this.id + "'");

			this.next_queue_advance = Math.floor(Date.now() / 1000) + (parseInt(ordered_queue[0].song.duration) - 1);
			this.score.positive = 0;
			this.score.negative = 0;

			this.vote_log = [];
			this.removeSongFromQueue(ordered_queue[0].id, ordered_queue[0].song.url_fragment);

			this.updateQueueList();
		} else {
			this.queue = [];
			this.song = false;
			this.next_queue_advance = Number.MAX_VALUE;

			database.connection.query("UPDATE `rooms` SET `song_name`=null,`song_artist`=null,`song_started_at`=0,`song_url_fragment`=null,`song_source`=null,`song_picture_url`=null WHERE `id`='" + this.id + "'");
		}
	}

	syncBackgrounds() {
		database.connection.query('SELECT `url` FROM `backgrounds` WHERE `scope` = \'' + this.id + '\'', (err, rows) => {
			if(rows.length > 0) {
				this.backgrounds = [];

				for(var row of rows)
					this.backgrounds.push(row.url);
			} else
				this.backgrounds = [];

			this.broadcast({
				event: "backgrounds",
				data: this.backgrounds
			});
		});
	}

	sendNotification(text, type) {
		this.broadcast({
			event: "notification",
			data: {
				text: text,
				type: type
			}
		});
	}

	sendScore() {
		this.broadcast({
			event: "score_update",
			data: {
				positive: this.score.positive,
				negative: this.score.negative
			}
		});
	}

	sendSystemMessage(message) {
		this.sendChatMessage("", message, true, true);
	}

	sendChatMessage(sender, message, log, formatted, color, hover_color) {
		log = log || true;
		formatted = formatted || false;
		color = color || "#2ECC71";
		hover_color = hover_color || "#27AE60";
		if(sender === "" || sender === ">") log = false;

		if(log) {
			this.chat_counter++;
			var new_message = message;
			if(!(sender === "" || sender === ">")) new_message = htmlencode.htmlEncode(message);

			this.chat_history.push({
				sender: sender,
				message: new_message,
				color: color,
				hover_color: hover_color
			});

			if(this.chat_counter > 20) this.chat_history.splice();
		}

		var data = {
			event: "chat",
			data: {
				sender: sender,
				message: message,
				color: color,
				hover_color: hover_color
			}
		};

		if(formatted) data.data.formatted = true;

		this.broadcast(data);
	}

	broadcast(message) {
		for(var listener_key in this.listeners) {
			var listener = this.listeners[listener_key];

			UserManager.getByKey(listener).send(message);
		}
	}

	iterate(cb) {
		for(var listener_key in this.listeners) {
			var listener = this.listeners[listener_key];

			cb(UserManager.getByKey(listener));
		}
	}

	tick() {
		if(Math.floor(Date.now() / 1000) >= this.next_queue_advance)
			this.advanceQueue();
	};
};