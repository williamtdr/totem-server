var permission = require("./permission.js"),
	SystemData = require("./SystemData");

var sendSystemMessage = (connection, message) => {
	connection.send(JSON.stringify({
		event: "chat",
		data: {
			sender: "",
			message: message
		}
	}));
};

module.exports = {
	INSUFFICENT_PERMISSION: '<span style="color: #E74C3C"><b>You don\'t have permission to use that command in this room.</b></span>',
	process: (connection, text, key, id, room) => {
		var arguments = text.split(" "),
			target = false,
			target_key = false,
			target_id = false,
			silent = false;

		var permission_list = permission.getPermissions(target_id, room.id);

		if(arguments[1] && arguments[1].length > 1) {
			target = arguments[1];

			for(var potential_key in SystemData.chatkeys) {
				var potential_name = SystemData.chatkeys[potential_key];

				if(potential_name === target)
					target_key = potential_key;
			}

			target_id = display_name_to_id[target.toLowerCase()];
			if(!target_id)
				target_id = false;
		}

		switch(arguments[0]) {
			case "/me":
				room.sendChatMessage('* ' + SystemData.chatkeys[key], text.replace("/me ", ""), true, true, "#BDC3C7", "#ECF0F1");
			break;
			case "/shrug":
				room.sendChatMessage(SystemData.chatkeys[key], "¯\\_(ツ)_/¯", true, true);
			break;
			case "/s":
			case "/skip":
			case "!skip":
				if(!(permission.getEffectivePermissionLevel(id, room.id) <= permission.EFFECTIVE_PERMISSION_LEVEL_HOST))
					return sendSystemMessage(connection, this.INSUFFICENT_PERMISSION);

				room.sendSystemMessage('<span style="color: #3498DB">' + SystemData.chatkeys[key] + " skipped the current song.</span>");
				room.sendNotification(SystemData.chatkeys[key] + " skipped the current song.", "danger");

				if(room.getOrderedQueue().length === 0)
					for(var listener of room.listeners)
						listener.send(JSON.stringify({
							event: "skip_to_black"
						}));

				room.advanceQueue();
			break;
			case "/qb":
			case "/queueban":
				if(arguments[2]) silent = true;
				if(!(permission.getEffectivePermissionLevel(id, room.id) <= permission.EFFECTIVE_PERMISSION_LEVEL_HOST))
					return sendSystemMessage(connection, this.INSUFFICENT_PERMISSION);

				if(!target)
					return sendSystemMessage(connection, '<span style="color: #3498DB">Usage: /qb [username]</span>');

				if(!target_id)
					return silent ? false : sendSystemMessage(connection, '<span style="color: #E74C3C"><b>User ' + target + ' not found.</b></span>');

				if(permission_list && !(permission_list.indexOf(permission.PERMISSION_LEVEL_ROOM_QUEUE_BANNED) > -1))
					return sendSystemMessage(connection, '<span style="color: #3498DB"><b>' + target + ' is already queue-banned in this room.</b></span>');

				room.removeUserFromQueue(target_id);

				permission.addPermission(target_id, {
					"level": permission.PERMISSION_LEVEL_ROOM_QUEUE_BANNED,
					"scope": room.room.id
				});

				room.sendSystemMessage('<span style="color: #9B59B6">' + SystemData.chatkeys[key] + ' banned ' + target + ' from adding songs to the queue.</span>');

				if(room.listeners[target_key])
					room.listeners[target_key].send(JSON.stringify({
						"event": "permission",
						"data": {
							"type": "queue_ban_room"
						}
					}));
			break;
			case "/ban":
			case "/b":
				if(arguments[2]) silent = true;
				if(!(permission.getEffectivePermissionLevel(id, room.room.id) <= permission.EFFECTIVE_PERMISSION_LEVEL_ADMIN))
					return sendSystemMessage(connection, this.INSUFFICENT_PERMISSION);

				if(!target)
					return sendSystemMessage(connection, '<span style="color: #3498DB">Usage: /ban [username]</span>');

				if(!target_id)
					return silent ? false : sendSystemMessage(connection, '<span style="color: #E74C3C"><b>User ' + target + ' not found.</b></span>');

				room.removeUserFromQueue(target_id);

				if(permission_list && permission_list.indexOf(permission.PERMISSION_LEVEL_ROOM_BANNED) > -1)
					return silent ? false : sendSystemMessage(connection, '<span style="color: #E74C3C"><b>' + target + ' is already banned in this room.</b></span>');

				permission.addPermission(target_id, {
					"level": permission.PERMISSION_LEVEL_ROOM_BANNED,
					"scope": room.room.id
				});
				room.sendSystemMessage('<span style="color: #9B59B6">' + SystemData.chatkeys[key] + ' banned ' + target + ' from the room.</span>');

				if(room.listeners[target_key])
					room.listeners[target_key].send(JSON.stringify({
						event: "permission", data: {type: "banned_room"}
					}));
			break;
			case "/unqueueban":
			case "/uqb":
				if(arguments[2]) silent = true;
				if(!(permission.getEffectivePermissionLevel(id, room.room.id) <= permission.EFFECTIVE_PERMISSION_LEVEL_HOST))
					return sendSystemMessage(connection, this.INSUFFICENT_PERMISSION);

				if(!target)
					return sendSystemMessage(connection, '<span style="color: #3498DB">Usage: /uqb [username]</span>');

				if(!target_id)
					return silent ? false : sendSystemMessage(connection, '<span style="color: #E74C3C"><b>User ' + target + ' not found.</b></span>');

				if(permission_list && !(permission_list.indexOf(permission.PERMISSION_LEVEL_ROOM_QUEUE_BANNED) > -1))
					return sendSystemMessage(connection, '<span style="color: #E74C3C"><b>' + target + ' is not queue-banned in this room.</b></span>');

				permission.removePermission(target_id, {
					"level": permission.PERMISSION_LEVEL_ROOM_QUEUE_BANNED,
					"scope": room.room.id
				});

				if(room.listeners[target_key])
					room.listeners[target_key].send(JSON.stringify({
						"event": "permission",
						"data": {
							"type": "unbanned"
						}
					}));

				room.sendSystemMessage('<span style="color: #9B59B6">' + SystemData.chatkeys[key] + ' removed ' + target + '\'s queue ban restriction.</span>');
			break;
			case "/unban":
			case "/pardon":
			case "/ub":
				if(arguments[2]) silent = true;
				if(!(permission.getEffectivePermissionLevel(id, room.room.id) <= permission.EFFECTIVE_PERMISSION_LEVEL_ADMIN))
					return sendSystemMessage(connection, this.INSUFFICENT_PERMISSION);

				if(!target)
					return sendSystemMessage(connection, '<span style="color: #3498DB">Usage: /pardon [username]</span>');

				if(!target_id)
					return silent ? false : sendSystemMessage(connection, '<span style="color: #E74C3C"><b>User ' + target + ' not found.</b></span>');

				if(permission_list && !(permission_list.indexOf(permission.PERMISSION_LEVEL_ROOM_BANNED) > -1))
					return silent ? false : sendSystemMessage(connection, '<span style="color: #E74C3C"><b>' + target + ' is not banned in this room.</b></span>');

				permission.removePermission(target_id, {
					"level": permission.PERMISSION_LEVEL_ROOM_BANNED,
					"scope": room.room.id
				});

				if(room.listeners[target_key])
					room.listeners[target_key].send(JSON.stringify({
						"event": "permission",
						"data": {
							"type": "unbanned"
						}
					}));

				room.sendSystemMessage('<span style="color: #9B59B6">' + SystemData.chatkeys[key] + ' unbanned ' + target + ' from the room.</span>');
			break;
			case "/siteban":
			case "/sb":
				if(arguments[2]) silent = true;
				if(!(permission.getPermissions(id, "global").indexOf(permission.PERMISSION_LEVEL_SITE_ADMIN)))
					return sendSystemMessage(connection, this.INSUFFICENT_PERMISSION);

				if(!target)
					return sendSystemMessage(connection, '<span style="color: #3498DB">Usage: /sb [username]</span>');

				if(!target_id)
					return sendSystemMessage(connection, '<span style="color: #E74C3C"><b>User ' + target + ' not found.</b></span>');

				room.removeUserFromQueue(target_id);

				permission_list = permission.getPermissions(target_id, "global");

				if(permission_list && permission_list.indexOf(permission.PERMISSION_LEVEL_SITE_BANNED) > -1)
					return sendSystemMessage(connection, '<span style="color: #E74C3C"><b>' + target + ' is already banned.</b></span>');

				permission.addPermission(target_id, {
					"level": permission.PERMISSION_LEVEL_SITE_BANNED,
					"scope": "global"
				});

				room.sendSystemMessage('<span style="color: #9B59B6">' + SystemData.chatkeys[key] + ' banned ' + target + ' (global).</span>');
				if(room.listeners[target_key])
					room.listeners[target_key].send(JSON.stringify({
						"event": "permission",
						"data": {
							"type": "banned_room"
						}
					}));
			break;
			case "/sitequeueban":
			case "/sqb":
				if(arguments[2]) silent = true;
				if(!(permission.getPermissions(id, "global").indexOf(permission.PERMISSION_LEVEL_SITE_ADMIN)))
					return sendSystemMessage(connection, this.INSUFFICENT_PERMISSION);

				if(!target)
					return sendSystemMessage(connection, '<span style="color: #3498DB">Usage: /sqb [username]</span>');

				if(!target_id)
					return silent ? false : sendSystemMessage(connection, '<span style="color: #E74C3C"><b>User ' + target + ' not found.</b></span>');

				permission_list = permission.getPermissions(target_id, "global");

				if(permission_list && permission_list.indexOf(permission.PERMISSION_LEVEL_SITE_QUEUE_BANNED) > -1)
					return silent ? false : sendSystemMessage(connection, '<span style="color: #E74C3C"><b>' + target + ' is already queue-banned.</b></span>');

				room.removeUserFromQueue(target_id);

				permission.addPermission(target_id, {
					"level": permission.PERMISSION_LEVEL_SITE_QUEUE_BANNED,
					"scope": "global"
				});

				room.sendSystemMessage('<span style="color: #9B59B6">' + SystemData.chatkeys[key] + ' queue-banned ' + target + ' (global).</span>');
				if(room.listeners[target_key])
					room.listeners[target_key].send(JSON.stringify({
						"event": "permission",
						"data": {
							"type": "queue_ban_site"
						}
					}));
			break;
			case "/mute":
			case "/m":
				if(arguments[2]) silent = true;
				if(!(permission.getEffectivePermissionLevel(id, room.room.id) <= permission.EFFECTIVE_PERMISSION_LEVEL_HOST))
					return sendSystemMessage(connection, this.INSUFFICENT_PERMISSION);

				if(!target)
					return sendSystemMessage(connection, '<span style="color: #3498DB">Usage: /m [username]</span>');

				if(!target_id)
					return silent ? false : sendSystemMessage(connection, '<span style="color: #E74C3C"><b>User ' + target + ' not found.</b></span>');

				if(permission_list && permission_list.indexOf(permission.PERMISSION_LEVEL_ROOM_MUTED) > -1)
					return silent ? false : sendSystemMessage(connection, '<span style="color: #E74C3C"><b>' + target + ' is already muted.</b></span>');

				permission.addPermission(target_id, {
					"level": permission.PERMISSION_LEVEL_ROOM_MUTED,
					"scope": room.room.id
				});

				room.sendSystemMessage('<span style="color: #9B59B6">' + SystemData.chatkeys[key] + ' muted ' + target + '.</span>');
				if(room.listeners[target_key]) {
					room.listeners[target_key].send(JSON.stringify({
						"event": "chat",
						"data": {
							sender: "",
							message: "You have been muted by room staff."
						}
					}));

					room.listeners[target_key].send(JSON.stringify({
						"event": "permission",
						"data": {
							"type": "muted_room"
						}
					}));
				}
			break;
			case "/unmute":
			case "/um":
				if(arguments[2]) silent = true;
				if(!(permission.getEffectivePermissionLevel(id, room.room.id) <= permission.EFFECTIVE_PERMISSION_LEVEL_HOST))
					return sendSystemMessage(connection, this.INSUFFICENT_PERMISSION);

				if(!target)
					return sendSystemMessage(connection, '<span style="color: #3498DB">Usage: /um [username]</span>');

				if(!target_id)
					return silent ? false : sendSystemMessage(connection, '<span style="color: #E74C3C"><b>User ' + target + ' not found.</b></span>');

				if(!permission_list || !(permission_list.indexOf(permission.PERMISSION_LEVEL_ROOM_MUTED) > -1))
					return silent ? false : sendSystemMessage(connection, '<span style="color: #E74C3C"><b>' + target + ' is not muted in this room.</b></span>');

				permission.removePermission(target_id, {
					"level": permission.PERMISSION_LEVEL_ROOM_MUTED,
					"scope": room.room.id
				});

				room.sendSystemMessage('<span style="color: #9B59B6">' + SystemData.chatkeys[key] + ' unmuted ' + target + '.</span>');
				if(room.listeners[target_key]) {
					room.listeners[target_key].send(JSON.stringify({
						"event": "chat",
						"data": {
							sender: "",
							message: "You have been unmuted by room staff."
						}
					}));
					room.listeners[target_key].send(JSON.stringify({
						"event": "permission",
						"data": {
							"type": "unmuted"
						}
					}));
				}
			break;
			case "/sitemute":
			case "/sm":
				if(arguments[2]) silent = true;
				if(!(permission.getPermissions(id, "global").indexOf(permission.PERMISSION_LEVEL_SITE_ADMIN)))
					return sendSystemMessage(connection, this.INSUFFICENT_PERMISSION);

				if(!target)
					return sendSystemMessage(connection, '<span style="color: #3498DB">Usage: /sm [username]</span>');

				if(!target_id)
					return slient ? false : sendSystemMessage(connection, '<span style="color: #E74C3C"><b>User ' + target + ' not found.</b></span>');

				permission_list = permission.getPermissions(target_id, "global");

				if(permission_list && permission_list.indexOf(permission.PERMISSION_LEVEL_SITE_MUTED) > -1)
					return sendSystemMessage(connection, '<span style="color: #E74C3C"><b>' + target + ' is already muted.</b></span>');

				permission.addPermission(target_id, {
					"level": permission.PERMISSION_LEVEL_SITE_MUTED,
					"scope": room.room.id
				});

				room.sendSystemMessage('<span style="color: #9B59B6">' + SystemData.chatkeys[key] + ' muted ' + target + ' (global).</span>');
				if(room.listeners[target_key]) {
					room.listeners[target_key].send(JSON.stringify({
						"event": "chat",
						"data": {
							sender: "",
							message: "You have been muted by site staff."
						}
					}));
					room.listeners[target_key].send(JSON.stringify({
						"event": "permission",
						"data": {
							"type": "muted_site"
						}
					}));
				}
			break;
			case "/promote":
				if(arguments[2]) silent = true;
				if(!(permission.getEffectivePermissionLevel(id, room.room.id) <= permission.EFFECTIVE_PERMISSION_LEVEL_ADMIN))
					return sendSystemMessage(connection, this.INSUFFICENT_PERMISSION);

				if(!target || !arguments[2])
					return sendSystemMessage(connection, '<span style="color: #3498DB">Usage: /promote [username] [host/admin]</span>');

				if(!target_id)
					return silent ? false : sendSystemMessage(connection, '<span style="color: #E74C3C"><b>User ' + target + ' not found.</b></span>');

				switch(arguments[2].toLowerCase()) {
					case "host":
						if(permission_list && permission_list.indexOf(permission.PERMISSION_LEVEL_ROOM_HOST) > -1)
							return sendSystemMessage(connection, '<span style="color: #E74C3C"><b>' + target + ' is already a host in this room.</b></span>');

						permission.addPermission(target_id, {
							"level": permission.PERMISSION_LEVEL_ROOM_HOST,
							"scope": room.room.id
						});
					break;
					case "admin":
						if(!(permission.getEffectivePermissionLevel(id, room.room.id) <= permission.PERMISSION_LEVEL_ROOM_OWNER))
							return sendSystemMessage(connection, '<span style="color: #E74C3C"><b>Only the room owner can promote or demote admins.</b></span>');

						if(permission_list && permission_list.indexOf(permission.PERMISSION_LEVEL_ROOM_ADMIN) > -1)
							return sendSystemMessage(connection, '<span style="color: #E74C3C"><b>' + target + ' is already an admin in this room.</b></span>');

						permission.addPermission(target_id, {
							"level": permission.PERMISSION_LEVEL_ROOM_ADMIN,
							"scope": room.room.id
						});
					break;
					default:
						return sendSystemMessage(connection, '<span style="color: #3498DB">Usage: /promote [username] [host/admin]</span>');
				}

				room.sendSystemMessage('<span style="color: #9B59B6">' + SystemData.chatkeys[key] + ' promoted ' + target + ' to ' + arguments[2].toLowerCase() + '.</span>');
				if(room.listeners[target_key])
					room.listeners[target_key].send(JSON.stringify({
						event: "chat", data: '<span style="color: #3498DB">' + SystemData.chatkeys[key] + ' promoted you to ' + arguments[2] + ' in this room. See /help for a list of commands.</span>'
					}));
			break;
			case "/demote":
				if(arguments[2]) silent = true;
				if(!(permission.getEffectivePermissionLevel(id, room.room.id) <= permission.EFFECTIVE_PERMISSION_LEVEL_ADMIN))
					return sendSystemMessage(connection, this.INSUFFICENT_PERMISSION);

				if(!target)
					return sendSystemMessage(connection, '<span style="color: #3498DB">Usage: /demote [username]</span>');

				if(!target_id)
					return sendSystemMessage(connection, '<span style="color: #E74C3C"><b>User ' + target + ' not found.</b></span>');

				if(permission.getEffectivePermissionLevel(target_id, room.room.id) === permission.PERMISSION_LEVEL_ROOM_ADMIN && permission.getEffectivePermissionLevel(id, room.room.id) != permission.PERMISSION_LEVEL_ROOM_OWNER)
					return sendSystemMessage(connection, '<span style="color: #E74C3C"><b>Only the room owner can promote or demote admins.</b></span>');

				room.sendSystemMessage('<span style="color: #9B59B6">' + SystemData.chatkeys[key] + ' took admin privileges from ' + target + '.</span>');
				permission.removePermission(target_id, {
					"level": permission.PERMISSION_LEVEL_ROOM_ADMIN,
					"scope": room.room.id
				});

				if(permission.getEffectivePermissionLevel(target_id, room.room.id) === permission.PERMISSION_LEVEL_ROOM_HOST) {
					room.sendSystemMessage('<span style="color: #9B59B6">' + SystemData.chatkeys[key] + ' took host privileges from ' + target + '.</span>');
					permission.removePermission(target_id, {
						"level": permission.PERMISSION_LEVEL_ROOM_HOST,
						"scope": room.room.id
					});
				}

				if(room.listeners[target_key])
					room.listeners[target_key].send(JSON.stringify({
						event: "chat", data: '<span style="color: #3498DB">' + SystemData.chatkeys[key] + ' removed your privileges in this room.</span>'
					}));
			break;
			case "/syncbackgrounds":
				if(!(permission.getEffectivePermissionLevel(id, room.id) <= permission.EFFECTIVE_PERMISSION_LEVEL_ADMIN))
					return sendSystemMessage(connection, this.INSUFFICENT_PERMISSION);

				room.syncBackgrounds();
			break;
			case "/setdesc":
				if(!(permission.getEffectivePermissionLevel(id, room.id) <= permission.EFFECTIVE_PERMISSION_LEVEL_ADMIN)) {
					sendSystemMessage(connection, this.INSUFFICENT_PERMISSION);
					return false;
				}
				var new_description = text.replace("/setdesc ", "");

				room.description = new_description;
				global.db.connection.query("UPDATE `rooms` SET `description`=" + global.db.connection.escape(new_description) + " WHERE `id`='" + room.id + "'");
				room.sendSystemMessage('<span style="color: #9B59B6">' + SystemData.chatkeys[key] + ' updated the room description.</span>');
				for(var listener of room.listeners)
					listener.send(JSON.stringify({
						event: "desc_update", data: new_description
					}));
			break;
			default:
				sendSystemMessage(connection, "Unknown command: " + arguments[0]);
		}
	}
};