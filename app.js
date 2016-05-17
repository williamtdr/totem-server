var colors = require("colors"),
	request = require("request"),
	WebSocketServer = require("websocket").server,
	htmlencode = require("htmlencode"),
	http = require("http");

var Room = require("./src/class/Room"),
	Song = require("./src/class/Song"),
	Score = require("./src/class/Score"),
	Config = require("./src/config"),
	SystemData = require("./src/SystemData"),
	permission = require("./src/permission"),
	utils = require("./src/utils"),
	command = require("./src/command");

global.db = require("./src/database");

var clients = [],
	rooms = [],
	display_name_to_id = [],
	id_map = [],
	tag_map = [],
	profiles = [];

var wsServer,
	webServer;

var getNextAddedAt = (data) => {
	var highest_added_at = 0;

	if(data.length > 0) {
		for(var index in data) {
			var item = data[index],
				time = (item.added_at + item.duration);

			if(time > highest_added_at)
				highest_added_at = time;
		}

		return highest_added_at;
	} else
		return Math.floor(Date.now() / 1000);
};

var getRoom = (key) => {
	if(!key)
		return false;

	for(var room_id in rooms)
		if(rooms[room_id].listeners[key])
			return rooms[room_id];

	return false;
};

var getRoomByConnection = (connection) => {
	for(var room of rooms)
		for(var listener of room.listeners)
			if(listener === connection)
				return room;

	return false;
};

var processLogin = (key, room_id, connection) => {
	if(!key)
		return false;

	if(key === 'unauthenticated') {
		var guest_key = "guest-" + utils.randomString(20);
		key = guest_key;

		console.log("[User] ".yellow + ("Guest connected to " + room_id).white);
		connection.send(JSON.stringify({
			event: "guest_key", data: guest_key
		}));

		if(rooms[room_id]) {
			rooms[room_id].listener_count++;
			rooms[room_id].updateUserCounter();
			connection.send(rooms[room_id].room_data_json);
		}
	} else {
		var regexp = /^[a-zA-Z0-9-]+$/;
		if(key.search(regexp) === -1) {
			return key;
		}
		if(room_id.search(regexp) === -1) {
			return key;
		}

		global.db.connection.query('SELECT `display_name`,`id`,\'' + room_id + '\' as `room` FROM `chatkeys` WHERE `auth` = \'' + key + '\'', function (err, rows) { // heads up: this is async and can screw the hell out of variable scope
			if(err) return;

			if(rows.length === 1) {
				var query_data = rows[0];

				SystemData.chatkeys[key] = query_data.display_name;
				id_map[key] = query_data.id;

				if(query_data.tag && query_data.tag.length > 0) tag_map[query_data.id] = {
					color: query_data.tag_color,
					text: query_data.tag
				};

				display_name_to_id[query_data.display_name.toLowerCase()] = query_data.id;

				if(rooms[room_id]) {
					if(permission.awaiting_permission_load[room_id])
						permission.awaiting_permission_load[room_id].push({connection: connection, id: query_data.id});

					if(permission.checkPermission(query_data.id, rooms[room_id].id, permission.PERMISSION_LEVEL_ROOM_QUEUE_BANNED))
						connection.send(JSON.stringify({
							event: "permission", data: {type: "queue_ban_room"}
						}));

					if(permission.getEffectivePermissionLevel(query_data.id, rooms[room_id].id) <= permission.EFFECTIVE_PERMISSION_LEVEL_ADMIN) {
						connection.send(JSON.stringify({
							event: "chat", data: {sender: "", message: '<span style="color: #2ECC71">Welcome! You have admin privileges in this room, check /help for a list of commands.</span>'}
						}));
						connection.send(JSON.stringify({
							event: "permission", data: {type: "room_admin"}
						}));
					}

					if(permission.getEffectivePermissionLevel(query_data.id, rooms[room_id].id) === permission.EFFECTIVE_PERMISSION_LEVEL_HOST) {
						connection.send(JSON.stringify({
							event: "chat", data: {sender: "", message: '<span style="color: #2ECC71">Welcome! You have moderation privileges in this room, check /help for a list of commands (see the Host section).</span>'}
						}));
						connection.send(JSON.stringify({
							event: "permission", data: {type: "room_host"}
						}));
					}

					if(permission.checkPermission(query_data.id, rooms[room_id].id, permission.PERMISSION_LEVEL_SITE_QUEUE_BANNED))
						connection.send(JSON.stringify({
							event: "permission", data: {type: "queue_ban_site"}
						}));

					if(permission.checkPermission(query_data.id, rooms[room_id].id, permission.PERMISSION_LEVEL_ROOM_MUTED))
						connection.send(JSON.stringify({
							event: "permission", data: {type: "muted_room"}
						}));

					if(permission.checkPermission(query_data.id, rooms[room_id].id, permission.PERMISSION_LEVEL_SITE_MUTED))
						connection.send(JSON.stringify({
							event: "permission", data: {type: "muted_site"}
						}));

					if(permission.checkPermission(query_data.id, rooms[room_id].id, permission.PERMISSION_LEVEL_SITE_BANNED))
						return connection.send(JSON.stringify({
							event: "permission", data: {type: "banned_site"}
						}));

					if(permission.checkPermission(query_data.id, rooms[room_id].id, permission.PERMISSION_LEVEL_ROOM_BANNED))
						return connection.send(JSON.stringify({
							event: "permission", data: {type: "banned_room"}
						}));

					if(profiles[query_data.id]) {
						connection.send(JSON.stringify({"event": "profile_update", "data": profiles[query_data.id]}));
					} else {
						global.db.connection.query('SELECT * FROM `profiles` WHERE `id` = \'' + query_data.id + '\'', function (err, rows) {
							if(err || rows.length != 1) return false;
							profiles[rows[0].id] = {
								bio: rows[0].bio,
								twitter: rows[0].twitter,
								steam: rows[0].steam,
								website: rows[0].website,
								profile_picture: rows[0].profile_picture,
								display_name: rows[0].display_name
							};
							connection.send(JSON.stringify({"event": "profile_update", "data": profiles[rows[0].id]}));
						});
					}
				}

				console.log("[User] ".yellow + (query_data.display_name + " connected to " + room_id).white);
				if(rooms[query_data.room] != undefined) {
					rooms[query_data.room].listener_count++;
					rooms[query_data.room].updateUserCounter();
					connection.send(rooms[room_id].room_data_json);

					rooms[query_data.room].sendChatMessage(">", "<span style=\"color:#BDC3C7\">" + query_data.display_name + " joined the room</span>", false, true, "#3498DB", "#2980B9");
					if(rooms[query_data.room].listeners_by_name.indexOf(query_data.display_name) === -1) {
						rooms[query_data.room].listeners_by_name.push(query_data.display_name);
						rooms[query_data.room].updateUserList();
					}

					var tmp_queue = [];
					for(var index in rooms[query_data.room].queue[query_data.id])  {
						var data = rooms[query_data.room].queue[query_data.id][index];

						tmp_queue.push({
							name: data.name,
							artist: data.artist,
							id: data.id,
							thumbnail: data.thumbnail,
							duration: data.duration,
							dj: data.dj
						});
					}
					if(tmp_queue.length > 0) connection.send(JSON.stringify({
						event: "queue_update",
						data: tmp_queue
					}));
				}
			}
		});
	}
	return key;
};

var onWsMessage = (request) => {
	if(request.requestedProtocols.indexOf('echo-protocol') === -1) {
		console.log("[System] ".blue + 'Rejecting a connection because of an incorrect protocol.');
		request.reject();
		return;
	} else
		var connection = request.accept('echo-protocol', request.origin);

	var index = clients.push(connection) - 1;

	try {
		connection.on('message', (message) => {
			if(message.type === 'utf8') {
				try {
					var data = JSON.parse(message.utf8Data),
						key = data.key === undefined ? false : data.key,
						room_id = data.room === undefined ? false : data.room;

					var room = getRoom(key),
						id = id_map[key],
						display_name = SystemData.chatkeys[key];

					switch(data.event) {
						case "login":
							for(var potential_room_id in rooms) {
								var potential_room = rooms[potential_room_id];

								for(var potential_listener_id in potential_room.listeners)
									if(potential_room.listeners[potential_listener_id] === connection) {
										console.log("[User] ".yellow + (display_name + ' from ' + potential_room.id + ' disconnected.').white);

										delete rooms[potential_room.id].listeners[potential_listener_id];
										potential_room.removeVote(key);
										rooms[potential_room.id].listener_count--;
										rooms[potential_room.id].updateUserCounter();
										if(SystemData.chatkeys[potential_listener_id]) rooms[potential_room.id].listeners_by_name = utils.removeA(potential_room.listeners_by_name, chatkeys[potential_listener_id]);
										rooms[potential_room.id].updateUserList();
									}
							}

							var new_room = rooms[data.room];
							if(new_room) {
								for(var room_name in rooms) {
									var tmproom = rooms[room_name];
									for(var listener_id in room.listeners)
										if(tmproom.listeners[listener_id] === connection)
											delete rooms[room_name][listener_id];
								}

								if(new_room.password)
									connection.send(JSON.stringify({
										"event": "requires_authentication",
										"display_name": new_room.display_name
									}));
								else
									rooms[room_id].listeners[processLogin(key, room_id, connection)] = connection;
							} else {
								global.db.connection.query('SELECT * FROM `rooms` WHERE `id` = \'' + room_id + '\'', function (err, rows) {
									if(rows && rows.length === 1) {
										var query_data = rows[0],
											room = new Room(room_id, query_data.display_name);

										room.description = query_data.description;
										room.icon = query_data.icon;

										permission.reload(query_data.id);
										permission.awaiting_permission_load[query_data.id] = [];

										rooms[room_id] = room;

										if(query_data.password !== "false") {
											room.password = query_data.password;
											connection.send(JSON.stringify({
												"event": "requires_authentication",
												"display_name": query_data.display_name
											}));

											room.updateRoomJson();
										} else {
											if(query_data.song_name != undefined) {
												rooms[room_id].song.name = query_data.song_name;
												rooms[room_id].song.artist = query_data.song_artist;
												rooms[room_id].song.source = query_data.song_source;
												rooms[room_id].song.url_fragment = query_data.url_fragment;
												rooms[room_id].song.started_at = query_data.song_started_at;
												rooms[room_id].song.picture_url = query_data.song_picture_url;
											}

											rooms[room_id].updateRoomJson();

											rooms[room_id].listeners[processLogin(key, room_id, connection)] = connection;
										}

										rooms[room_id].syncBackgrounds();

										return true;
									}

									if(err)
										console.log(err);

									connection.send(JSON.stringify({event: "room_data", data: false}));
								});
							}
						break;
						case "set_profile":
							data = data.data;
							if(!(typeof data.bio === "string" && typeof data.twitter === "string" && typeof data.steam === "string" && typeof data.website === "string" && typeof data.profile_picture === "string")) return false;
							for(var tmp_key in data) {
								if(typeof data[tmp_key] === "string" && data[tmp_key].indexOf(";") > 0) return false;
							}
							if(data.profile_picture.substring(0, 36) != "http://static.totem.fm/user_profile/") return false;
							if(id_map[key]) {
								data.bio = htmlencode.htmlEncode(data.bio);
								data.twitter = htmlencode.htmlEncode(data.twitter);
								data.steam = htmlencode.htmlEncode(data.steam);
								data.website = htmlencode.htmlEncode(data.website);
								data.profile_picture = htmlencode.htmlEncode(data.profile_picture);
								profiles[id_map[key]] = {
									bio: data.bio,
									twitter: data.twitter,
									steam: data.steam,
									website: data.website,
									profile_picture: data.profile_picture,
									display_name: SystemData.chatkeys[key]
								};
								global.db.connection.query('REPLACE INTO `profiles` (`id`, `bio`, `twitter`, `steam`, `website`, `profile_picture`, `display_name`) VALUES (' + global.db.connection.escape(id_map[key]) + ', ' + global.db.connection.escape(data.bio) + ', ' + global.db.connection.escape(data.twitter) + ', ' + global.db.connection.escape(data.steam) + ', ' + global.db.connection.escape(data.website) + ', ' + global.db.connection.escape(data.profile_picture) + ', ' + global.db.connection.escape(SystemData.chatkeys[key]) + ')');
							}
						break;
						case "get_profile":
							if(key === 'unauthenticated') break;

							var room = getRoomByConnection(connection);

							var target_id = display_name_to_id[data.data];
							if(profiles[target_id]) {
								var profile_obj = profiles[target_id];
								if(tag_map[target_id]) {
									var tag = tag_map[target_id];
									profile_obj.tag_color = tag.color;
									profile_obj.tag = tag.text;
								} else {
									if(room) switch(permission.getEffectivePermissionLevel(target_id, room.id.toLowerCase())) {
										case permission.EFFECTIVE_PERMISSION_LEVEL_ADMIN:
											profile_obj.tag = "ROOM ADMIN";
											profile_obj.tag_color = "#F1C40F";
										break;
										case permission.EFFECTIVE_PERMISSION_LEVEL_OWNER:
											profile_obj.tag = "ROOM OWNER";
											profile_obj.tag_color = "#3498DB";
										break;
										case permission.EFFECTIVE_PERMISSION_LEVEL_HOST:
											profile_obj.tag = "ROOM HOST";
											profile_obj.tag_color = "#2ECC71";
										break;
										case permission.EFFECTIVE_PERMISSION_LEVEL_BANNED:
											profile_obj.tag = "BANNED";
											profile_obj.tag_color = "#E74C3C";
										break;
										case permission.EFFECTIVE_PERMISSION_LEVEL_MUTED:
											profile_obj.tag = "MUTED";
											profile_obj.tag_color = "#E74C3C";
										break;
										case permission.EFFECTIVE_PERMISSION_LEVEL_QUEUE_BANNED:
											profile_obj.tag = "QUEUE-BANNED";
											profile_obj.tag_color = "#E74C3C";
									}
								}

								connection.send(JSON.stringify({"event": "profile", data: profile_obj}));
							} else {
								connection.send(JSON.stringify({"event": "profile", data: {
									display_name: data.data,
									failed: true
								}}));
							}
						break;
						case "reload_icon":
							if(key === 'unauthenticated') break;
							var room = getRoomByConnection(connection);

							if(!room) return;
							if(permission.getEffectivePermissionLevel(id, room.id) != permission.EFFECTIVE_PERMISSION_LEVEL_OWNER) return false;

							global.db.connection.query('SELECT `icon` FROM `rooms` WHERE `id`=\'' + room.id.toLowerCase() + '\'', function (err, rows) {
								for(var row of rows)
									rooms[row.id].icon = data.icon;

								var update_json = JSON.stringify({
									event: "icon_change",
									data: rooms[room.id].icon
								});
								for(var index in room.listeners) {
									room.listeners[index].send(update_json);
								}
								rooms[room.id].updateRoomJson();
							});
						break;
						case "reload_room_permission_table":
							if(key === 'unauthenticated') break;
							var room = getRoomByConnection(connection);
							if(!room) return;
							if(permission.getEffectivePermissionLevel(id, room.id) != permission.EFFECTIVE_PERMISSION_LEVEL_OWNER) return false;

							var check = [];
							for(index in room.listeners) {
								check.push({
									connection: room.listeners[index],
									id: id_map[index]
								});
							}
							permission.reload(room.id, check);
						break;
						case "remove_password":
							if(key === 'unauthenticated') break;
							var room = getRoomByConnection(connection);
							if(!room) return;
							if(permission.getEffectivePermissionLevel(id, room.id) != permission.EFFECTIVE_PERMISSION_LEVEL_OWNER) return false;

							rooms[room.id].password = false;
							rooms[room.id].updateRoomJson();
						break;
						case "delete_room":
							if(key === 'unauthenticated') break;
							var room = getRoomByConnection(connection);
							if(!room) return;
							if(permission.getEffectivePermissionLevel(id, room.id) != permission.EFFECTIVE_PERMISSION_LEVEL_OWNER) return false;

							for(var listener of room.listeners)
								listener.send(JSON.stringify({
									event: "room_deleted"
								}));

							delete rooms[room.id];
						break;
						case "set_password":
							if(key === 'unauthenticated') break;
							var room = getRoomByConnection(connection);
							if(!room) return;
							if(permission.getEffectivePermissionLevel(id, room.id) != permission.EFFECTIVE_PERMISSION_LEVEL_OWNER) return false;

							rooms[room.id].password = data.password;
							for(var listener of room.listeners)
								listener.send(JSON.stringify({
									event: "requires_authentication",
									"display_name": room.display_name
								}));
							room.updateRoomJson();
						break;
						case "password_attempt":
							if(data.data.password === rooms[data.data.scope].password)
								rooms[data.data.scope].listeners[processLogin(key, data.data.scope, connection)] = connection;
							else
								connection.send(JSON.stringify({
									"event": "invalid_password"
								}));
						break;
						case "vote":
							if(parseInt(data.vote) !== 1 && parseInt(data.vote) !== -1 && parseInt(data.vote) !== 0) break;
							if(key === 'unauthenticated') break;
							if(!room) return;

							room.removeVote(key);
							if(parseInt(data.vote) === 1) {
								console.log("[Vote] " + (display_name + " upvoted the song in " + room.display_name).green);
								room.score.positive += 1;
								room.vote_log[key] = 1;
							} else if(parseInt(data.vote) === -1) {
								console.log("[Vote] " + (display_name + " downvoted the song in " + room.display_name).red);
								room.score.negative += 1;
								room.vote_log[key] = -1;
							}
							room.sendScore();
							room.checkScore();
						break;
						case "queue_append_multiple":
							if(key === 'unauthenticated') break;
							if(!room) return false;
							if(!data) return false;

							var user_permissions = permission.getEffectivePermissionLevel(id, room_id);
							if(user_permissions >= 4 && user_permissions <= permission.PERMISSION_LEVEL_ROOM_BANNED) {
								connection.send(JSON.stringify({
									event: "permission",
									data: {
										type: "queue_ban_room"
									}
								}));
								break;
							}

							var success = 0,
								failed = 0;

							for(var song_index in data.data) {
								var song_id = data.data[song_index];
								if(room.song && song_id === room.song.url_fragment) {
									failed++;
									delete data.data[song_index];
									continue;
								}
								for(var tmp_index in room.queue[id_map[key]]) {
									var tmp_data = room.queue[id_map[key]][tmp_index];
									if(tmp_data.id === song_id) {
										delete data.data[song_index];
										failed++;
										continue;
									}
								}
							}

							if(data.data.length === 0) {
								connection.send(JSON.stringify({
									event: "notification",
									data: {
										text: "Added " + success + " songs to the room queue, " + failed + " songs failed.",
										type: "success"
									}
								}));
								return false;
							}

							var request = http.request(global.user_config.get("api_url") + "/youtube/getMultipleSongInfo.php?data=" + data.data.join(",") + "&scope=" + room.id);
							request.on('response', function (res) {
								res.on('data', function (response_data) {
									dataRaw = response_data.toString();
									if(dataRaw.length > 0) {
										try {
											dataParsed = JSON.parse(dataRaw);
											failed += dataParsed.failed;
											for(var res_song_index in dataParsed.info) {
												var res_song = dataParsed.info[res_song_index];
												if(res_song.duration < 600) {
													console.log("[Debug] Song added, new song duration: " + res_song.duration);

													console.log("[Queue] ".magenta + (display_name + " added " + res_song.artist + " - " + res_song.name + " to " + room.display_name + "'s queue").white);


													if(!room.queue[id_map[key]]) room.queue[id_map[key]] = [];
													room.queue[id_map[key]].push({
														name: res_song.name,
														artist: res_song.artist,
														id: res_song.id,
														thumbnail: res_song.thumbnail,
														duration: res_song.duration,
														added_at: getNextAddedAt(room.queue[id_map[key]]),
														dj: display_name,
														dj_id: id_map[key],
														connection: connection
													});

													room.updateQueueList();

													success++;

													if(!room.song) {
														console.log("[Debug] No song playing, forcing a queue advance");
														room.advanceQueue();
													}
												} else {
													connection.send(JSON.stringify({
														event: "notification",
														data: {
															text: "You can't queue a song longer than 10 minutes.",
															type: "danger"
														}
													}));
												}
											}

											connection.send(JSON.stringify({
												event: "notification",
												data: {
													text: "Added " + success + " songs to the room queue, " + failed + " songs failed.",
													type: "success"
												}
											}));

											var tmp_queue = [];
											for(var index in room.queue[id_map[key]])  {
												var data = room.queue[id_map[key]][index];
												tmp_queue.push({
													name: data.name,
													artist: data.artist,
													id: data.id,
													thumbnail: data.thumbnail,
													duration: data.duration,
													dj: display_name
												});
											}
											connection.send(JSON.stringify({
												event: "queue_update",
												data: tmp_queue
											}));
										} catch(e) {
											connection.send(JSON.stringify({
												event: "notification",
												data: {
													text: "Encountered an error when trying to queue that playlist.",
													type: "danger"
												}
											}));
										}
									}
								});
							});
							request.end();
						break;
						case "queue_append":
							if(key === 'unauthenticated') break;
							if(!room) return false;
							if(!data) return false;

							var user_permissions = permission.getEffectivePermissionLevel(id, room_id);
							if(user_permissions >= 4 && user_permissions <= permission.PERMISSION_LEVEL_ROOM_BANNED) {
								connection.send(JSON.stringify({
									event: "permission",
									data: {
										type: "queue_ban_room"
									}
								}));
								break;
							}

							if(room.song && data.data === room.song.url_fragment) {
								connection.send(JSON.stringify({
									event: "notification",
									data: {
										text: "That song is already playing in this room.",
										type: "danger"
									}
								}));
								return false;
							}

							for(var index in room.queue[id_map[key]]) {
								var tmp_data = room.queue[id_map[key]][index];
								if(tmp_data.id === data.data) {
									connection.send(JSON.stringify({
										event: "notification",
										data: {
											text: "This song is already in your queue.",
											type: "danger"
										}
									}));
									return false;
								}
							}

							var request = http.request(global.user_config.get("api_url") + "/youtube/getSongInfo.php?id=" + data.data + "&scope=" + room.id);
							request.on('response', function (res) {
								res.on('data', function (response_data) {
									dataRaw = response_data.toString();
									if(dataRaw.length > 0) {
										try {
											dataParsed = JSON.parse(dataRaw);
											if(!dataParsed.success) {
												connection.send(JSON.stringify({
													event: "notification",
													data: {
														text: dataParsed.reason,
														type: "warning"
													}
												}));
												return false;
											}
											if(dataParsed.duration < 600) {
												console.log("[Debug] Song added, new song duration: " + dataParsed.duration);

												console.log("[Queue] ".magenta + (display_name + " added " + dataParsed.artist + " - " + dataParsed.name + " to " + room.display_name + "'s queue").white);

												if(!room.queue[id_map[key]]) room.queue[id_map[key]] = [];
												room.queue[id_map[key]].push({
													name: dataParsed.name,
													artist: dataParsed.artist,
													id: dataParsed.id,
													thumbnail: dataParsed.thumbnail,
													duration: dataParsed.duration,
													added_at: getNextAddedAt(room.queue[id_map[key]]),
													dj: display_name,
													dj_id: id_map[key],
													connection: connection
												});

												room.updateQueueList();

												var tmp_queue = [];
												for(var index in room.queue[id_map[key]])  {
													var data = room.queue[id_map[key]][index];
													tmp_queue.push({
														name: data.name,
														artist: data.artist,
														id: data.id,
														thumbnail: data.thumbnail,
														duration: data.duration,
														dj: display_name
													});
												}
												connection.send(JSON.stringify({
													event: "queue_update",
													data: tmp_queue
												}));

												connection.send(JSON.stringify({
													event: "notification",
													data: {
														text: "Added " + dataParsed.artist + " - " + dataParsed.name + " to the room queue.",
														type: "success"
													}
												}));

												if(!room.song) {
													console.log("[Debug] No song playing, forcing a queue advance");
													room.advanceQueue();
												}
											} else {
												connection.send(JSON.stringify({
													event: "notification",
													data: {
														text: "You can't queue a song longer than 10 minutes.",
														type: "danger"
													}
												}));
											}
										} catch(e) {
											connection.send(JSON.stringify({
												event: "notification",
												data: {
													text: "Encountered an error when trying to queue that song.",
													type: "danger"
												}
											}));
										}
									}
								});
							});
							request.end();
						break;
						case "queue_remove":
							if(key === 'unauthenticated') break;
							if(!room) return false;
							if(!data) return false;

							for(var index in room.queue[id_map[key]]) {
								var item = room.queue[id_map[key]][index];
								if(item.id === data.data) {
									delete room.queue[id_map[key]][index];
								}
							}

							room.updateQueueList();

							if(room.queue[id_map[key]]) {
								var tmp_queue = [];
								for(var index in room.queue[id_map[key]])  {
									var data = room.queue[id_map[key]][index];
									tmp_queue.push({
										name: data.name,
										artist: data.artist,
										id: data.id,
										thumbnail: data.thumbnail,
										duration: data.duration,
										dj: data.dj
									});
								}
								connection.send(JSON.stringify({
									event: "queue_update",
									data: tmp_queue
								}));
							} else {
								connection.send(JSON.stringify({
									event: "queue_update",
									data: []
								}));
							}
						break;
						case "chat":
							if(data.data.length < 1) break;
							if (/^\s*$/.test(data.data)) break;
							if(key === 'unauthenticated') break;
							if(!room) break;
							if(permission.getEffectivePermissionLevel(id, room_id) === permission.EFFECTIVE_PERMISSION_LEVEL_MUTED) return false;
							if(room.last_message.sender === key && room.last_message.text === data.data) break;


							if(data.data.substring(0,1) === "/") {
								command.process(connection, data.data, key, id, room);
							} else {
								console.log(("[Chat > " + room.display_name + "] ").blue + (SystemData.chatkeys[key] + ": " + data.data).white);

								room.last_message.text = data.data;
								room.last_message.sender = key;

								var color = "#2ECC71",
									hover_color = "#27AE60";

								switch(permission.getEffectivePermissionLevel(id_map[key], room.id)) {
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

								switch(SystemData.chatkeys[key].toLowerCase()) {
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

								room.sendChatMessage(SystemData.chatkeys[key], data.data, true, false, color, hover_color);
							}
						break;
						default:
							console.log('Unknown packet:', data.event);
					}
				} catch(e) {
					console.log(e);
					console.log('Invalid JSON');
					console.log(message.data);
				}
			}
		});

		connection.on('close', function (reasonCode, description) {
			var found = false;

			for(var room_name in rooms) {
				var room = rooms[room_name];
				for(var listener_id in room.listeners) {
					var listener = room.listeners[listener_id],
						display_name = SystemData.chatkeys[listener_id];

					if(listener === connection) {
						found = true;
						if(!display_name) {
							console.log("[User] ".yellow + ("Guest from " + room.id + " disconnected.").white);
							return true;
						}
						console.log("[User] ".yellow + (display_name + ' from ' + room.id + ' disconnected.').white);
						room.removeVote(listener_id);
					}
				}
			}

			for(var room_index in rooms)
				for(var listener_id in rooms[room_index].listeners)
					if(rooms[room_index].listeners[listener_id] === connection) {
						rooms[room_index].listener_count--;
						rooms[room_index].updateUserCounter();
						delete rooms[room_index].listeners[listener_id];
						if(SystemData.chatkeys[listener_id]) rooms[room_name].listeners_by_name = utils.removeA(room.listeners_by_name, SystemData.chatkeys[listener_id]);

						delete SystemData.chatkeys[listener_id];
						global.db.connection.query('DELETE FROM `chatkeys` WHERE `auth` = ' + global.db.connection.escape(listener_id));
					}

			if(!found) console.log("[User] ".yellow + (connection.remoteAddress + " disconnected").white);

			clients.splice(index, 1);
		});
	} catch (e) {
		console.log("[System] ".blue + e);
	}
};

var bind = () => {
	webServer = http.createServer(function (request, response) {
		response.writeHead(302, {
			'Location': 'http://totem.fm'
		});

		response.end();
	});

	webServer.listen(global.user_config.get("port"), () => {
		console.log("[System] ".blue + ("Web server started on port " + global.user_config.get("port")).white);
	});

	wsServer = new WebSocketServer({
		httpServer: webServer,
		autoAcceptConnections: false
	});

	wsServer.on('request', onWsMessage);
};

var next = (result) => {
	if(!result) {
		console.log("There was an error reading the Totem configuration file (config/config.json).");
		console.log("Please make sure the file exists, has the proper permissions and valid JSON.");
		console.log("If you'd like to start over, copy config.sample.json.");
		return process.exit(1);
	}

	console.log("[System] ".blue + "Establishing database connection...".white);

	global.db.connect(true, (dbError, dbConnection) => {
		global.db.connection = dbConnection;

		console.log("[System] ".blue + "Loading user table...".white);
		global.db.connection.query('SELECT `id`,`display_name` FROM `users`', (err, rows) => {
			for(var row of rows)
				display_name_to_id[row.display_name.toLowerCase()] = row.id;
		});

		global.db.connection.query("UPDATE `rooms` SET `user_counter`=0,`song_name`=null,`song_artist`=null,`song_started_at`=0,`song_url_fragment`=null,`song_source`=0,`song_picture_url`=null");

		console.log("[System] ".blue + "Starting web server...".white);

		bind();

		setInterval(function() {
			for(var room_id in rooms)
				rooms[room_id].tick();
		}, 100);
	});
};

console.log("[System] ".blue + "Loading configuration...".white);
global.user_config = new Config("config/config.json", next);