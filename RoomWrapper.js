var Room = require('./Room.js'),
	Song = require('./Song.js'),
	htmlencode = require('htmlencode');

function RoomWrapper(id, display_name) {
    this.room = new Room(id, display_name);
    this.song_update_json = "";
    this.room_data_json = "";

    this.listeners = []; // single-dimensional list of keys, users currently connected to the room
    this.vote_log = []; // associative array of keys -> vote (+/-). Used to remove a vote when a user leaves a room and when they change it
    this.key = id; // allows for iterating over room list by id
    this.chat_counter = 0;
	this.password = false;
    this.next_queue_advance = Number.MAX_VALUE;
	this.queue = [];
	this.listeners_by_name_total = [];
}

RoomWrapper.prototype.updateSongJson = function () {
    this.song_update_json = JSON.stringify({
        event: "song_change",
        data: {
            song: this.room.song,
            dj: this.room.current_dj
        },
        room: this.id
    });
};

RoomWrapper.prototype.removeUserFromQueue = function (display_name) {
	var id = display_name_to_id[display_name.toLowerCase()];
	if(this.queue[id]) delete this.queue[id];
};

RoomWrapper.prototype.updateUserList = function () {
    for(var listener_id in this.listeners) {
        var listener = this.listeners[listener_id];
        listener.send(JSON.stringify({
            event: "user_list_change",
            data: this.room.listeners_by_name
        }));
    }
};

RoomWrapper.prototype.getOrderedQueue = function(append_id) {
	append_id = append_id || false;
	var queue_data = [],
		everyones_next_items = [];
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

		everyones_next_items[local_lowest_started_at] = this.queue[user_id][lowest_index];
	}

	var keys = Object.keys(everyones_next_items),
		i, len = keys.length;

	keys.sort();

	for (i = 0; i < len; i++) {
		var k = keys[i],
			item = everyones_next_items[k];

		if(k != Number.MAX_VALUE) {
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
	}

	return queue_data;
};

RoomWrapper.prototype.updateQueueList = function () {
	var data = this.getOrderedQueue();
	for(var listener_id in this.listeners) {
        var listener = this.listeners[listener_id];
        listener.send(JSON.stringify({
            event: "queue_change",
            data: data
        }));
    }
    if(!data || data.length == 0) {
        this.room.queue = [];
    } else {
        this.room.queue = data;
    }
};

RoomWrapper.prototype.removeSongFromQueue = function (user_id, song_id) {
	if(this.queue[user_id]) {
		for(var index in this.queue[user_id]) {
			var queue_item = this.queue[user_id][index];
			if(queue_item.id == song_id) {
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

		if(this.queue[user_id].length == 0) {
			delete this.queue[user_id];
		}
	}
};

RoomWrapper.prototype.advanceQueue = function () {
	var ordered_queue = this.getOrderedQueue(true);

    if(ordered_queue.length > 0) {
        if(this.room.current_dj.length > 0) this.sendNotification(this.room.current_dj + " got " + this.room.score.positive + " upvotes and " + this.room.score.negative + " downvotes.", "warning");
		ordered_queue[0].song.started_at = Math.floor(Date.now() / 1000);
		this.room.song = ordered_queue[0].song;
        this.room.current_dj = ordered_queue[0].dj;
		this.updateSongJson();

        for (var listener_id in this.listeners) {
            listener = this.listeners[listener_id];
            if(listener != undefined) listener.send(this.song_update_json);
        }

		console.log("[Song] ".green + (this.room.current_dj).white + (' is playing ').gray + (this.room.song.artist).white + ' - '.gray + (this.room.song.name).white);

		db.getConnection().query("UPDATE `rooms` SET `song_name`='" + this.room.song.name + "',`song_artist`='" + this.room.song.artist + "',`song_started_at`='" + this.room.song.started_at + "',`song_url_fragment`='" + this.room.song.url_fragment + "',`song_source`='" + this.room.song.source + "',`song_picture_url`='" + this.room.song.picture_url + "' WHERE `id`='" + this.room.id + "'");

        this.next_queue_advance = Math.floor(Date.now() / 1000) + (parseInt(ordered_queue[0].song.duration) - 3);
        this.room.score.positive = 0;
        this.room.score.negative = 0;

		this.updateRoomJson();

        this.vote_log = [];
		this.removeSongFromQueue(ordered_queue[0].id, ordered_queue[0].song.url_fragment);

		this.updateQueueList();
    } else {
        this.room.queue = [];
        this.room.song = false;
        this.updateRoomJson();
        this.updateSongJson();
        this.next_queue_advance = Number.MAX_VALUE;

        db.getConnection().query("UPDATE `rooms` SET `song_name`=null,`song_artist`=null,`song_started_at`=0,`song_url_fragment`=null,`song_source`=null,`song_picture_url`=null WHERE `id`='" + this.room.id + "'");
    }
};

RoomWrapper.prototype.sendNotification = function (text, type) {
    for(var listener_id in this.listeners) {
        var listener = this.listeners[listener_id];
        listener.send(JSON.stringify({
            event: "notification",
            data: {
                text: text,
                type: type
            }
        }));
    }
};

RoomWrapper.prototype.sendScore = function () {
    for(var listener_id in this.listeners) {
        var listener = this.listeners[listener_id];
        listener.send(JSON.stringify({
            event: "score_update",
            data: {
                positive: this.room.score.positive,
                negative: this.room.score.negative
            }
        }));
    }
};

RoomWrapper.prototype.checkScore = function () {
    if(this.room.score.negative > (this.room.score.positive * 3)) {
        if(((this.room.score.positive) + (this.room.score.negative)) > 3) {
            this.sendNotification(this.room.current_dj + "'s song was skipped based on community vote.", "error");
            this.advanceQueue();
        }
    }
};

RoomWrapper.prototype.updateUserCounter = function() {
    var database = db.getConnection();
    database.query("UPDATE `rooms` SET `user_counter`=" + database.escape(this.room.listener_count) + " WHERE `id`=" + database.escape(this.room.id));
    for(var listener_id in this.listeners) {
        var listener = this.listeners[listener_id];
        listener.send(JSON.stringify({
            event: "user_counter_update",
            data: this.room.listener_count
        }));
    }
	this.updateRoomJson();
};

RoomWrapper.prototype.syncBackgrounds = function() {
    var database = db.getConnection();
    var room_id = this.room.id;
    database.query('SELECT `url` FROM `backgrounds` WHERE `scope` = \'' + room_id + '\'', function (err, rows) {
        if(rows.length > 0) {
            global.rooms[room_id].room.backgrounds = [];
            for(var row_id in rows) {
                var url = rows[row_id].url;
                global.rooms[room_id].room.backgrounds.push(url);
            }
        } else {
			global.rooms[room_id].room.backgrounds = [];
		}
		for(var listener_id in rooms[room_id].listeners) {
			global.rooms[room_id].listeners[listener_id].send(JSON.stringify({
				"event": "backgrounds",
				data: global.rooms[room_id].room.backgrounds
			}));
		}
    });
};

RoomWrapper.prototype.sendSystemMessage = function (message) {
    this.sendChatMessage('', message, true, true);
};

RoomWrapper.prototype.sendChatMessage = function (sender, message, log, formatted, color, hover_color) {
	log = log || true;
	formatted = formatted || false;
	color = color || "#2ECC71";
	hover_color = hover_color || "#27AE60";
	if(sender == "" || sender == ">") log = false;
	if(log) {
		this.chat_counter++;
		var new_message = message;
		if(!(sender == "" || sender == ">")) new_message = htmlencode.htmlEncode(message);

		this.room.chat_history.push({
			sender: sender,
			message: new_message,
			color: color,
			hover_color: hover_color
		});

		if(this.chat_counter > 20) this.room.chat_history.splice();
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

	for (var listener_id in this.listeners) {
        var listener = this.listeners[listener_id];
        listener.send(data);
    }
};

RoomWrapper.prototype.updateRoomJson = function () {
    this.room_data_json = JSON.stringify({
        event: "room_data",
        data: this.room,
        room: this.id
    });
};

RoomWrapper.prototype.tick = function () {
	if(Math.floor(Date.now() / 1000) >= this.next_queue_advance) {
		this.advanceQueue();
	}
};

module.exports = RoomWrapper;