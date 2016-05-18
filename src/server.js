var http = require("http"),
	htmlencode = require("htmlencode");

var database = require("./database"),
	UserManager = require("./UserManager"),
	RoomManager = require("./RoomManager"),
	permission = require("./PermissionManager"),
	utils = require("./utils"),
	command = require("./command");

module.exports = (room, user, data) => {
	try {
		switch(data.event) {
			case "login":
				RoomManager.disconnect(user.connection);

				var new_room = RoomManager.getById(data.room);

				if(new_room) {
					if(data.guest_key) {
						RoomManager.disconnect(user.connection);

						UserManager.login((user) => {
							new_room.add(user);
						}, data.key, user.connection);
					} else {
						if(new_room && user && new_room.id === user.room)
							break;

						new_room.add(user);
					}
				}
			break;
			case "set_profile":
				data = data.data;

				if(!(typeof data.bio === "string" && typeof data.twitter === "string" && typeof data.steam === "string" && typeof data.website === "string" && typeof data.profile_picture === "string")) return false;
				
				for(var tmp_key in data)
					if(typeof data[tmp_key] === "string" && data[tmp_key].indexOf(";") > 0) return false;
				
				if(data.profile_picture.substring(0, 36) !== "http://static.totem.fm/user_profile/") return false;

				data.bio = htmlencode.htmlEncode(data.bio);
				data.twitter = htmlencode.htmlEncode(data.twitter);
				data.steam = htmlencode.htmlEncode(data.steam);
				data.website = htmlencode.htmlEncode(data.website);
				data.profile_picture = htmlencode.htmlEncode(data.profile_picture);
				user.profile = {
					bio: data.bio,
					twitter: data.twitter,
					steam: data.steam,
					website: data.website,
					profile_picture: data.profile_picture,
					display_name: user.name
				};

				database.connection.query('REPLACE INTO `profiles` (`id`, `bio`, `twitter`, `steam`, `website`, `profile_picture`, `display_name`) VALUES (' + database.connection.escape(user.id) + ', ' + database.connection.escape(data.bio) + ', ' + database.connection.escape(data.twitter) + ', ' + database.connection.escape(data.steam) + ', ' + database.connection.escape(data.website) + ', ' + database.connection.escape(data.profile_picture) + ', ' + database.connection.escape(user.name) + ')');
			break;
			case "get_profile":
				UserManager.getProfile((profile) => {
					if(profile) {
						switch(permission.getEffectivePermissionLevel(data.data, room.id.toLowerCase())) {
							case permission.EFFECTIVE_PERMISSION_LEVEL_ADMIN:
								profile.tag = "ROOM ADMIN";
								profile.tag_color = "#F1C40F";
							break;
							case permission.EFFECTIVE_PERMISSION_LEVEL_OWNER:
								profile.tag = "ROOM OWNER";
								profile.tag_color = "#3498DB";
							break;
							case permission.EFFECTIVE_PERMISSION_LEVEL_HOST:
								profile.tag = "ROOM HOST";
								profile.tag_color = "#2ECC71";
							break;
							case permission.EFFECTIVE_PERMISSION_LEVEL_BANNED:
								profile.tag = "BANNED";
								profile.tag_color = "#E74C3C";
							break;
							case permission.EFFECTIVE_PERMISSION_LEVEL_MUTED:
								profile.tag = "MUTED";
								profile.tag_color = "#E74C3C";
							break;
							case permission.EFFECTIVE_PERMISSION_LEVEL_QUEUE_BANNED:
								profile.tag = "QUEUE-BANNED";
								profile.tag_color = "#E74C3C";
						}

						user.send({"event": "profile", data: profile});
					} else
						user.send({"event": "profile", data: {
							display_name: data.data,
							failed: true
						}});
				}, data.data);
			break;
			case "reload_icon":
				if(permission.getEffectivePermissionLevel(user.id, room.id) !== permission.EFFECTIVE_PERMISSION_LEVEL_OWNER) return false;

				database.connection.query('SELECT `icon` FROM `rooms` WHERE `id`=\'' + room.id.toLowerCase() + '\'', (err, rows) => {
					for(var row of rows)
						room.icon = row.icon;

					room.broadcast({
						event: "icon_change",
						data: room.icon
					});
				});
			break;
			case "reload_room_permission_table":
				if(permission.getEffectivePermissionLevel(user.id, room.id) !== permission.EFFECTIVE_PERMISSION_LEVEL_OWNER) return false;

				var check = [];
				room.iterate((user) => {
					check.push({
						connection: user.connection,
						id: user.id
					});
				});

				permission.reload(room.id, check);
			break;
			case "remove_password":
				if(permission.getEffectivePermissionLevel(user.id, room.id) !== permission.EFFECTIVE_PERMISSION_LEVEL_OWNER) return false;

				room.password = false;
			break;
			case "delete_room":
				if(permission.getEffectivePermissionLevel(user.id, room.id) !== permission.EFFECTIVE_PERMISSION_LEVEL_OWNER) return false;

				room.broadcast({
					event: "room_deleted"
				});

				delete RoomManager.rooms[room.id];
			break;
			case "set_password":
				if(permission.getEffectivePermissionLevel(user.id, room.id) !== permission.EFFECTIVE_PERMISSION_LEVEL_OWNER) return false;

				room.password = data.password;
				room.broadcast({
					event: "requires_authentication",
					display_name: room.name
				});
			break;
			case "password_attempt":
				if(data.data.password === room.password)
					room.add(user);
				else
					user.send({
						"event": "invalid_password"
					});
			break;
			case "vote":
				if(parseInt(data.vote) !== 1 && parseInt(data.vote) !== -1 && parseInt(data.vote) !== 0) break;

				room.removeVote(user);
				if(parseInt(data.vote) === 1) {
					console.log("[Vote] " + (user.name + " upvoted the song in " + room.name).green);
					room.score.positive += 1;
					room.vote_log[user.key] = 1;
				} else if(parseInt(data.vote) === -1) {
					console.log("[Vote] " + (user.name + " downvoted the song in " + room.name).red);
					room.score.negative += 1;
					room.vote_log[user.key] = -1;
				}

				room.sendScore();
				room.checkScore();
			break;
			case "queue_append_multiple":
				var user_permissions = permission.getEffectivePermissionLevel(user.id, room.id);

				if(user_permissions >= 4 && user_permissions <= permission.PERMISSION_LEVEL_ROOM_BANNED)
					return user.send({
						event: "permission",
						data: {
							type: "queue_ban_room"
						}
					});

				var success = 0,
					failed = 0;

				for(var songIndex in data.data) {
					var songId = data.data[songIndex];

					if(room.song && songId === room.song.url_fragment) {
						failed++;
						delete data.data[songIndex];
						continue;
					}

					for(var queueIndex in room.queue[user.id]) {
						var queueData = room.queue[user.id][queueIndex];

						if(queueData.id === song_id) {
							delete data.data[queueIndex];
							failed++;
						}
					}
				}

				if(data.data.length === 0)
					return user.send({
						event: "notification",
						data: {
							text: "Added " + success + " songs to the room queue, " + failed + " songs failed.",
							type: "success"
						}
					});

				var request = http.request(global.user_config.get("api_url") + "/youtube/getMultipleSongInfo.php?data=" + data.data.join(",") + "&scope=" + room.id);
				request.on("response", (res) => {
					res.on("data", (response_data) => {
						var dataRaw = response_data.toString(),
							dataParsed;

						if(dataRaw.length > 0) {
							try {
								dataParsed = JSON.parse(dataRaw);
								failed += dataParsed.failed;

								for(var res_song_index in dataParsed.info) {
									var res_song = dataParsed.info[res_song_index];

									if(res_song.duration < 600) {
										console.log("[Debug] Song added, new song duration: " + res_song.duration);

										console.log("[Queue] ".magenta + (user.name + " added " + res_song.artist + " - " + res_song.name + " to " + room.id + "'s queue").white);

										if(!room.queue[user.id]) room.queue[user.id] = [];
										room.queue[user.id].push({
											name: res_song.name,
											artist: res_song.artist,
											id: res_song.id,
											thumbnail: res_song.thumbnail,
											duration: res_song.duration,
											added_at: utils.getNextAddedAt(room.queue[user.id]),
											dj: user.name,
											dj_id: user.id,
											connection: user.connection
										});

										room.updateQueueList();

										success++;

										if(!room.song) {
											console.log("[Debug] No song playing, forcing a queue advance");
											room.advanceQueue();
										}
									} else
										failed++;
								}

								user.send({
									event: "notification",
									data: {
										text: "Added " + success + " songs to the room queue, " + failed + " songs failed.",
										type: "success"
									}
								});

								var tmp_queue = [];
								for(var index in room.queue[user.id])  {
									var queue_data = room.queue[user.id][index];
									tmp_queue.push({
										name: queue_data.name,
										artist: queue_data.artist,
										id: queue_data.id,
										thumbnail: queue_data.thumbnail,
										duration: queue_data.duration,
										dj: user.name
									});
								}

								user.send({
									event: "queue_update",
									data: tmp_queue
								});
							} catch(e) {
								user.send({
									event: "notification",
									data: {
										text: "Encountered an error when trying to queue that playlist.",
										type: "danger"
									}
								});
							}
						}
					});
				});
				request.end();
			break;
			case "queue_append":
				var user_permissions = permission.getEffectivePermissionLevel(user.id, room.id);

				if(user_permissions >= 4 && user_permissions <= permission.PERMISSION_LEVEL_ROOM_BANNED)
					return user.send({
						event: "permission",
						data: {
							type: "queue_ban_room"
						}
					});

				if(room.song && data.data === room.song.url_fragment)
					return user.send({
						event: "notification",
						data: {
							text: "That song is already playing in this room.",
							type: "danger"
						}
					});

				for(var index in room.queue[user.id]) {
					var tmp_data = room.queue[user.id][index];

					if(tmp_data.id === data.data)
						return user.send({
							event: "notification",
							data: {
								text: "This song is already in your queue.",
								type: "danger"
							}
						});
				}

				var request = http.request(global.user_config.get("api_url") + "/youtube/getSongInfo.php?id=" + data.data + "&scope=" + room.id);
				request.on("response", function (res) {
					res.on("data", (response_data) => {
						var dataRaw = response_data.toString(),
							dataParsed;

						if(dataRaw.length > 0) {
							try {
								dataParsed = JSON.parse(dataRaw);
								if(!dataParsed.success)
									return user.send({
										event: "notification",
										data: {
											text: dataParsed.reason,
											type: "warning"
										}
									});

								if(dataParsed.duration < 600) {
									console.log("[Debug] Song added, new song duration: " + dataParsed.duration);

									console.log("[Queue] ".magenta + (user.name + " added " + dataParsed.artist + " - " + dataParsed.name + " to " + room.id + "'s queue").white);

									if(!room.queue[user.id]) room.queue[user.id] = [];
									room.queue[user.id].push({
										name: dataParsed.name,
										artist: dataParsed.artist,
										id: dataParsed.id,
										thumbnail: dataParsed.thumbnail,
										duration: dataParsed.duration,
										added_at: utils.getNextAddedAt(room.queue[user.id]),
										dj: user.name,
										dj_id: user.id,
										connection: user.connection
									});

									room.updateQueueList();

									var tmp_queue = [];
									for(var index in room.queue[user.id])  {
										var queue_data = room.queue[user.id][index];

										tmp_queue.push({
											name: queue_data.name,
											artist: queue_data.artist,
											id: queue_data.id,
											thumbnail: queue_data.thumbnail,
											duration: queue_data.duration,
											dj: user.name
										});
									}

									user.send({
										event: "queue_update",
										data: tmp_queue
									});

									user.send({
										event: "notification",
										data: {
											text: "Added " + dataParsed.artist + " - " + dataParsed.name + " to the room queue.",
											type: "success"
										}
									});

									if(!room.song) {
										console.log("[Debug] No song playing, forcing a queue advance");
										room.advanceQueue();
									}
								} else
									user.send({
										event: "notification",
										data: {
											text: "You can't queue a song longer than 10 minutes.",
											type: "danger"
										}
									});
							} catch(e) {
								user.send({
									event: "notification",
									data: {
										text: "Encountered an error when trying to queue that song.",
										type: "danger"
									}
								});
							}
						}
					});
				});
				request.end();
			break;
			case "queue_remove":
				for(var index in room.queue[user.id]) {
					var item = room.queue[user.id][index];

					if(item.id === data.data)
						delete room.queue[user.id][index];
				}

				room.updateQueueList();

				if(room.queue[user.id]) {
					var tmp_queue = [];
					for(var index in room.queue[user.id])  {
						var queue_data = room.queue[user.id][index];
						tmp_queue.push({
							name: queue_data.name,
							artist: queue_data.artist,
							id: queue_data.id,
							thumbnail: queue_data.thumbnail,
							duration: queue_data.duration,
							dj: queue_data.dj
						});
					}
					user.send({
						event: "queue_update",
						data: tmp_queue
					});
				} else
					user.send({
						event: "queue_update",
						data: []
					});
			break;
			case "chat":
				if(data.data.length < 1) break;
				if (/^\s*$/.test(data.data)) break;
				if(user.guest) break;
				if(!room) break;
				if(permission.getEffectivePermissionLevel(user.id, room.id) === permission.EFFECTIVE_PERMISSION_LEVEL_MUTED) return false;
				if(room.last_message.sender === user.key && room.last_message.text === data.data) break;

				if(data.data.substring(0,1) === "/") {
					command.process(user.connection, data.data, key, id, room);
				} else {
					console.log(("[Chat > " + room.name + "] ").blue + (user.name + ": " + data.data).white);

					room.last_message.text = data.data;
					room.last_message.sender = user.key;

					var color = "#2ECC71",
						hover_color = "#27AE60";

					switch(permission.getEffectivePermissionLevel(user.id, room.id)) {
						case permission.EFFECTIVE_PERMISSION_LEVEL_OWNER:
							color = "#F1C40F";
							hover_color = "#F39C12";
						break;
						case permission.EFFECTIVE_PERMISSION_LEVEL_ADMIN:
							color = "#3498DB";
							hover_color = "#2980B9";
						break;
						case permission.EFFECTIVE_PERMISSION_LEVEL_HOST:
							color = "#9B59B6";
							hover_color = "#8E44AD";
						break;
						case permission.EFFECTIVE_PERMISSION_LEVEL_MUTED:
						case permission.EFFECTIVE_PERMISSION_LEVEL_BANNED:
						case permission.EFFECTIVE_PERMISSION_LEVEL_QUEUE_BANNED:
							color = "#E74C3C";
							hover_color = "#C0392B";
					}

					switch(user.name.toLowerCase()) {
						case "williamtdr":
						case "pogodaanton":
						case "dcv":
						case "tntloverlol":
						case "koolkidkenny":
						case "vitals":
						case "vitals #2":
							color = "#ECF0F1";
							hover_color = "#BDC3C7";
					}

					room.sendChatMessage(user.name, data.data, true, false, color, hover_color);
				}
			break;
			default:
				console.log("Unknown packet: " + data.event);
		}
	} catch(e) {
		console.log("Internal exception when processing user message:");
		console.log(e);
		console.log(data);
	}
};