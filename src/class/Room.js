"use strict";

var Song = require("./Song.js"),
	Score = require("./Score.js"),
	htmlencode = require('htmlencode');

module.exports = class Room {
	constructor(id, display_name) {
		this.id = id;
		this.display_name = display_name;
		this.description = "";
		this.song = false;
		this.score = new Score();
		this.current_dj = "";

		this.chat_history = [];
		this.listeners_by_name = [];
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
			display_name: this.display_name,
			description: this.description,
			song: this.song,
			score: this.score,
			current_dj: this.current_dj,
			chat_history: this.chat_history,
			listeners_by_name: this.listeners_by_name,
			backgrounds: this.backgrounds,
			listener_count: this.listener_count,
			icon: this.icon
		};
	}

	removeUserFromQueue(id) {
		if(this.queue[id])
			delete this.queue[id];
	}

	updateUserList() {
		for(var listener of this.listeners)
			listener.send(JSON.stringify({
				event: "user_list_change",
				data: this.listeners_by_name
			}));
	}

	getOrderedQueue(append_id) {
		var queue_data = [],
			everyones_next_items = [];

		append_id = append_id || false;

		for(var user_id in this.queue) {
			var local_lowest_started_at = Number.MAX_VALUE,
				lowest_index = 0;

			if(this.queue[user_id].length === 0) {
				delete this.queue[user_id];
				break;
			}

			for(var data of this.queue[user_id])
				if(data.added_at < local_lowest_started_at) {
					local_lowest_started_at = data.added_at;
					lowest_index = data_index;
				}

			everyones_next_items[local_lowest_started_at] = this.queue[user_id][lowest_index];
		}

		var keys = Object.keys(everyones_next_items),
			i, len = keys.length;

		keys.sort();

		for(i = 0; i < len; i++) {
			var k = keys[i],
				item = everyones_next_items[k];

			if(k != Number.MAX_VALUE) {
				var s = new Song();
				s.name = item.name;
				s.artist = item.artist;
				s.url_fragment = item.id;
				s.picture_url = item.thumbnail;
				s.duration = item.duration;

				if(append_id)
					queue_data.push({
						song: s,
						dj: item.dj,
						id: item.dj_id
					});
				else
					queue_data.push({
						song: s,
						dj: item.dj
					});
			}
		}

		return queue_data;
	}

	updateUserCounter() {
		global.db.connection.query("UPDATE `rooms` SET `user_counter`=" + global.db.connection.escape(this.listener_count) + " WHERE `id`=" + global.db.connection.escape(this.id));
		for(var listener of this.listeners)
			listener.send(JSON.stringify({
				event: "user_counter_update",
				data: this.listener_count
			}));

		this.updateRoomJson();
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

		for(var listener of this.listeners)
			listener.send(JSON.stringify({
				event: "queue_change",
				data: data
			}));

		if(!data || data.length === 0)
			this.queue = [];
		else
			this.queue = data;
	}

	// Remove a user's vote when they leave a room
	removeVote(listener_id) {
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

			for(var listener of this.listeners)
				if(listener != undefined)
					listener.send(JSON.stringify({
						event: "song_change",
						data: {
							song: this.song,
							dj: this.current_dj
						},
						room: this.id
					}));

			console.log("[Song] ".green + (this.current_dj).white + (' is playing ').gray + (this.song.artist).white + ' - '.gray + (this.song.name).white);

			global.db.connection.query("UPDATE `rooms` SET `song_name`='" + this.song.name + "',`song_artist`='" + this.song.artist + "',`song_started_at`='" + this.song.started_at + "',`song_url_fragment`='" + this.song.url_fragment + "',`song_source`='" + this.song.source + "',`song_picture_url`='" + this.song.picture_url + "' WHERE `id`='" + this.id + "'");

			this.next_queue_advance = Math.floor(Date.now() / 1000) + (parseInt(ordered_queue[0].song.duration) - 3);
			this.score.positive = 0;
			this.score.negative = 0;

			this.updateRoomJson();

			this.vote_log = [];
			this.removeSongFromQueue(ordered_queue[0].id, ordered_queue[0].song.url_fragment);

			this.updateQueueList();
		} else {
			this.queue = [];
			this.song = false;
			this.updateRoomJson();
			this.next_queue_advance = Number.MAX_VALUE;

			global.db.connection.query("UPDATE `rooms` SET `song_name`=null,`song_artist`=null,`song_started_at`=0,`song_url_fragment`=null,`song_source`=null,`song_picture_url`=null WHERE `id`='" + this.id + "'");
		}
	}

	syncBackgrounds() {
		global.db.connection.query('SELECT `url` FROM `backgrounds` WHERE `scope` = \'' + this.id + '\'', (err, rows) => {
			if(rows.length > 0) {
				this.backgrounds = [];

				for(var row of rows)
					this.backgrounds.push(row.url);
			} else
				this.backgrounds = [];

			for(var listener of this.listeners)
				listener.send(JSON.stringify({
					event: "backgrounds",
					data: this.backgrounds
				}));
		});
	}

	sendNotification(text, type) {
		for(var listener of this.listeners)
			listener.send(JSON.stringify({
				event: "notification",
				data: {
					text: text,
					type: type
				}
			}));
	}

	sendScore() {
		for(var listener of this.listeners)
			listener.send(JSON.stringify({
				event: "score_update",
				data: {
					positive: this.score.positive,
					negative: this.score.negative
				}
			}));
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
		data = JSON.stringify(data);

		for(var listener of this.listeners)
			listener.send(data);
	}

	updateRoomJson() {
		this.room_data_json = JSON.stringify({
			event: "room_data",
			data: this.encode(),
			room: this.id
		});
	}

	tick() {
		if(Math.floor(Date.now() / 1000) >= this.next_queue_advance)
			this.advanceQueue();
	};
};