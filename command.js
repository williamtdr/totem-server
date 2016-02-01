var permission = require("./permission.js"),
    database = require("./database.js");

module.exports.INSUFFICENT_PERMISSION = '<span style="color: #E74C3C"><b>You don\'t have permission to use that command in this room.</b></span>';

module.exports.sendSystemMessage = function(connection, message) {
	connection.send(JSON.stringify({
		event: "chat",
		data: {
			sender: "",
			message: message
		}
	}));
};

module.exports.process = function(connection, text, key, id, room) {
	var arguments = text.split(" ");
	var target = false;
	var target_key = false;
	var target_id = false;

	if(arguments[1] && arguments[1].length > 1) {
		target = arguments[1];

		for (var potential_key in chatkeys) {
			var potential_name = chatkeys[potential_key];
			if (potential_name == target) {
				target_key = potential_key;
			}
		}

		target_id = display_name_to_id[target.toLowerCase()];
        if(!target_id) target_id = false;
	}

    var silent = false;

	switch(arguments[0]) {
        case "/me":
            room.sendChatMessage('* ' + chatkeys[key], text.replace("/me ", ""), true, true, "#BDC3C7", "#ECF0F1");
        break;
		case "/shrug":
			room.sendChatMessage(chatkeys[key], "¯\\_(ツ)_/¯", true, true);
		break;
		case "/s":
		case "/skip":
		case "!skip":
			if(!(permission.getEffectivePermissionLevel(id, room.room.id) <= permission.EFFECTIVE_PERMISSION_LEVEL_HOST)) {
                this.sendSystemMessage(connection, this.INSUFFICENT_PERMISSION);
				return false;
			}

			room.sendSystemMessage('<span style="color: #3498DB">' + chatkeys[key] + " skipped the current song.</span>");
			room.sendNotification(chatkeys[key] + " skipped the current song.", "danger");

			if(room.getOrderedQueue().length == 0) {
				for(var listener_id in room.listeners) {
					room.listeners[listener_id].send(JSON.stringify({
						event: "skip_to_black"
					}));
				}
			}

			room.advanceQueue();
			break;
		case "/qb":
		case "/queueban":
            if(arguments[2]) silent = true;
			if(!(permission.getEffectivePermissionLevel(id, room.room.id) <= permission.EFFECTIVE_PERMISSION_LEVEL_HOST)) {
				this.sendSystemMessage(connection, this.INSUFFICENT_PERMISSION);
				return false;
			}

			if(!target) {
				this.sendSystemMessage(connection, '<span style="color: #3498DB">Usage: /qb [username]</span>');
				return false;
			}

			if(!target_id) {
                if(!silent) this.sendSystemMessage(connection, '<span style="color: #E74C3C"><b>User ' + target + ' not found.</b></span>');
				return false;
			}

            var permission_list = permission.getPermissions(target_id, room.room.id);
			if(permission_list && !(permission_list.indexOf(permission.PERMISSION_LEVEL_ROOM_QUEUE_BANNED) > -1)) {
				this.sendSystemMessage(connection, '<span style="color: #3498DB"><b>' + target + ' is already queue-banned in this room.</b></span>');
				return false;
			}

			room.removeUserFromQueue(target);

			permission.addPermission(target_id, {
				"level": permission.PERMISSION_LEVEL_ROOM_QUEUE_BANNED,
				"scope": room.room.id
			});
            room.sendSystemMessage('<span style="color: #9B59B6">' + chatkeys[key] + ' banned ' + target + ' from adding songs to the queue.</span>');
			if(room.listeners[target_key]) {
				room.listeners[target_key].send(JSON.stringify({
					"event": "permission",
					"data": {
						"type": "queue_ban_room"
					}
				}));
			}
			break;
		case "/ban":
		case "/b":
            if(arguments[2]) silent = true;
            if(!(permission.getEffectivePermissionLevel(id, room.room.id) <= permission.EFFECTIVE_PERMISSION_LEVEL_ADMIN)) {
				this.sendSystemMessage(connection, this.INSUFFICENT_PERMISSION);
				return false;
			}
			if(!target) {
				this.sendSystemMessage(connection, '<span style="color: #3498DB">Usage: /ban [username]</span>');
				return false;
			}

			if(!target_id) {
                if(!silent) this.sendSystemMessage(connection, '<span style="color: #E74C3C"><b>User ' + target + ' not found.</b></span>');
				return false;
			}

			room.removeUserFromQueue(target);

            var permission_list = permission.getPermissions(target_id, room.room.id);
            if(permission_list && permission_list.indexOf(permission.PERMISSION_LEVEL_ROOM_BANNED) > -1) {
				this.sendSystemMessage(connection, '<span style="color: #E74C3C"><b>' + target + ' is already banned in this room.</b></span>');
				return false;
			}

			permission.addPermission(target_id, {
				"level": permission.PERMISSION_LEVEL_ROOM_BANNED,
				"scope": room.room.id
			});
            room.sendSystemMessage('<span style="color: #9B59B6">' + chatkeys[key] + ' banned ' + target + ' from the room.</span>');
			if(room.listeners[target_key]) {
				room.listeners[target_key].send(JSON.stringify({
					event: "permission", data: {type: "banned_room"}
				}));
			}
			break;
        case "/unqueueban":
        case "/uqb":
            if(arguments[2]) silent = true;
            if(!(permission.getEffectivePermissionLevel(id, room.room.id) <= permission.EFFECTIVE_PERMISSION_LEVEL_HOST)) {
                this.sendSystemMessage(connection, this.INSUFFICENT_PERMISSION);
                return false;
            }
            if(!target) {
                this.sendSystemMessage(connection, '<span style="color: #3498DB">Usage: /uqb [username]</span>');
                return false;
            }

            if(!target_id) {
                if(!silent) this.sendSystemMessage(connection, '<span style="color: #E74C3C"><b>User ' + target + ' not found.</b></span>');
                return false;
            }

            var permission_list = permission.getPermissions(target_id, room.room.id);
            if(permission_list && !(permission_list.indexOf(permission.PERMISSION_LEVEL_ROOM_QUEUE_BANNED) > -1)) {
                this.sendSystemMessage(connection, '<span style="color: #E74C3C"><b>' + target + ' is not queue-banned in this room.</b></span>');
                return false;
            }

            permission.removePermission(target_id, {
                "level": permission.PERMISSION_LEVEL_ROOM_QUEUE_BANNED,
                "scope": room.room.id
            });
            if(room.listeners[target_key]) {
                room.listeners[target_key].send(JSON.stringify({
                    "event": "permission",
                    "data": {
                        "type": "unbanned"
                    }
                }));
            }
            room.sendSystemMessage('<span style="color: #9B59B6">' + chatkeys[key] + ' removed ' + target + '\'s queue ban restriction.</span>');
            break;
        case "/unban":
        case "/pardon":
        case "/ub":
            if(arguments[2]) silent = true;
            if(!(permission.getEffectivePermissionLevel(id, room.room.id) <= permission.EFFECTIVE_PERMISSION_LEVEL_ADMIN)) {
                this.sendSystemMessage(connection, this.INSUFFICENT_PERMISSION);
                return false;
            }
            if(!target) {
                this.sendSystemMessage(connection, '<span style="color: #3498DB">Usage: /pardon [username]</span>');
                return false;
            }

            if(!target_id) {
                if(!silent) this.sendSystemMessage(connection, '<span style="color: #E74C3C"><b>User ' + target + ' not found.</b></span>');
                return false;
            }

            var permission_list = permission.getPermissions(target_id, room.room.id);
            if(permission_list && !(permission_list.indexOf(permission.PERMISSION_LEVEL_ROOM_BANNED) > -1)) {
                this.sendSystemMessage(connection, '<span style="color: #E74C3C"><b>' + target + ' is not banned in this room.</b></span>');
                return false;
            }

            permission.removePermission(target_id, {
                "level": permission.PERMISSION_LEVEL_ROOM_BANNED,
                "scope": room.room.id
            });
            if(room.listeners[target_key]) {
                room.listeners[target_key].send(JSON.stringify({
                    "event": "permission",
                    "data": {
                        "type": "unbanned"
                    }
                }));
            }
            room.sendSystemMessage('<span style="color: #9B59B6">' + chatkeys[key] + ' unbanned ' + target + ' from the room.</span>');
            break;
		case "/siteban":
		case "/sb":
            if(arguments[2]) silent = true;
			if(!(permission.getPermissions(id, "global").indexOf(permission.PERMISSION_LEVEL_SITE_ADMIN))) {
				this.sendSystemMessage(connection, this.INSUFFICENT_PERMISSION);
				return false;
			}
			if(!target) {
				this.sendSystemMessage(connection, '<span style="color: #3498DB">Usage: /sb [username]</span>');
				return false;
			}

			if(!target_id) {
                if(!silent) this.sendSystemMessage(connection, '<span style="color: #E74C3C"><b>User ' + target + ' not found.</b></span>');
				return false;
			}

			room.removeUserFromQueue(target);

            var permission_list = permission.getPermissions(target_id, "global");
            if(permission_list && permission_list.indexOf(permission.PERMISSION_LEVEL_SITE_BANNED) > -1) {
				this.sendSystemMessage(connection, '<span style="color: #E74C3C"><b>' + target + ' is already banned.</b></span>');
				return false;
			}

			permission.addPermission(target_id, {
				"level": permission.PERMISSION_LEVEL_SITE_BANNED,
				"scope": "global"
			});
            room.sendSystemMessage('<span style="color: #9B59B6">' + chatkeys[key] + ' banned ' + target + ' (global).</span>');
			if(room.listeners[target_key]) {
				room.listeners[target_key].send(JSON.stringify({
					"event": "permission",
					"data": {
						"type": "banned_room"
					}
				}));
			}
			break;
		case "/sitequeueban":
		case "/sqb":
            if(arguments[2]) silent = true;
			if(!(permission.getPermissions(id, "global").indexOf(permission.PERMISSION_LEVEL_SITE_ADMIN))) {
				this.sendSystemMessage(connection, this.INSUFFICENT_PERMISSION);
				return false;
			}
			if(!target) {
				this.sendSystemMessage(connection, '<span style="color: #3498DB">Usage: /sqb [username]</span>');
				return false;
			}

			if(!target_id) {
                if(!silent) this.sendSystemMessage(connection, '<span style="color: #E74C3C"><b>User ' + target + ' not found.</b></span>');
				return false;
			}

            var permission_list = permission.getPermissions(target_id, "global");
            if(permission_list && permission_list.indexOf(permission.PERMISSION_LEVEL_SITE_QUEUE_BANNED) > -1) {
                if(!silent) this.sendSystemMessage(connection, '<span style="color: #E74C3C"><b>' + target + ' is already queue-banned.</b></span>');
				return false;
			}

			room.removeUserFromQueue(target);

			permission.addPermission(target_id, {
				"level": permission.PERMISSION_LEVEL_SITE_QUEUE_BANNED,
				"scope": "global"
			});
            room.sendSystemMessage('<span style="color: #9B59B6">' + chatkeys[key] + ' queue-banned ' + target + ' (global).</span>');
			if(room.listeners[target_key]) {
				room.listeners[target_key].send(JSON.stringify({
					"event": "permission",
					"data": {
						"type": "queue_ban_site"
					}
				}));
			}
			break;
		case "/mute":
		case "/m":
            if(arguments[2]) silent = true;
			if(!(permission.getEffectivePermissionLevel(id, room.room.id) <= permission.EFFECTIVE_PERMISSION_LEVEL_HOST)) {
				this.sendSystemMessage(connection, this.INSUFFICENT_PERMISSION);
				return false;
			}
			if(!target) {
				this.sendSystemMessage(connection, '<span style="color: #3498DB">Usage: /m [username]</span>');
				return false;
			}

			if(!target_id) {
                if(!silent) this.sendSystemMessage(connection, '<span style="color: #E74C3C"><b>User ' + target + ' not found.</b></span>');
				return false;
			}

            var permission_list = permission.getPermissions(target_id, room.room.id);
            if(permission_list && permission_list.indexOf(permission.PERMISSION_LEVEL_ROOM_MUTED) > -1) {
                if(!silent) this.sendSystemMessage(connection, '<span style="color: #E74C3C"><b>' + target + ' is already muted.</b></span>');
				return false;
			}

			permission.addPermission(target_id, {
				"level": permission.PERMISSION_LEVEL_ROOM_MUTED,
				"scope": room.room.id
			});
            room.sendSystemMessage('<span style="color: #9B59B6">' + chatkeys[key] + ' muted ' + target + '.</span>');
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
            if(!(permission.getEffectivePermissionLevel(id, room.room.id) <= permission.EFFECTIVE_PERMISSION_LEVEL_HOST)) {
                this.sendSystemMessage(connection, this.INSUFFICENT_PERMISSION);
                return false;
            }
            if(!target) {
                this.sendSystemMessage(connection, '<span style="color: #3498DB">Usage: /um [username]</span>');
                return false;
            }

            if(!target_id) {
                if(!silent) this.sendSystemMessage(connection, '<span style="color: #E74C3C"><b>User ' + target + ' not found.</b></span>');
                return false;
            }

            var permission_list = permission.getPermissions(target_id, room.room.id);
            if(!permission_list || !(permission_list.indexOf(permission.PERMISSION_LEVEL_ROOM_MUTED) > -1)) {
                if(!silent) this.sendSystemMessage(connection, '<span style="color: #E74C3C"><b>' + target + ' is not muted in this room.</b></span>');
                return false;
            }

            permission.removePermission(target_id, {
                "level": permission.PERMISSION_LEVEL_ROOM_MUTED,
                "scope": room.room.id
            });
            room.sendSystemMessage('<span style="color: #9B59B6">' + chatkeys[key] + ' unmuted ' + target + '.</span>');
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
			if(!(permission.getPermissions(id, "global").indexOf(permission.PERMISSION_LEVEL_SITE_ADMIN))) {
				this.sendSystemMessage(connection, this.INSUFFICENT_PERMISSION);
				return false;
			}
			if(!target) {
				this.sendSystemMessage(connection, '<span style="color: #3498DB">Usage: /sm [username]</span>');
				return false;
			}

			if(!target_id) {
                if(!silent) this.sendSystemMessage(connection, '<span style="color: #E74C3C"><b>User ' + target + ' not found.</b></span>');
				return false;
			}

            var permission_list = permission.getPermissions(target_id, "global");
            if(permission_list && permission_list.indexOf(permission.PERMISSION_LEVEL_SITE_MUTED) > -1) {
				this.sendSystemMessage(connection, '<span style="color: #E74C3C"><b>' + target + ' is already muted.</b></span>');
				return false;
			}

			permission.addPermission(target_id, {
				"level": permission.PERMISSION_LEVEL_SITE_MUTED,
				"scope": room.room.id
			});
            room.sendSystemMessage('<span style="color: #9B59B6">' + chatkeys[key] + ' muted ' + target + ' (global).</span>');
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
            if(!(permission.getEffectivePermissionLevel(id, room.room.id) <= permission.EFFECTIVE_PERMISSION_LEVEL_ADMIN)) {
                this.sendSystemMessage(connection, this.INSUFFICENT_PERMISSION);
                return false;
            }
            if(!target || !arguments[2]) {
                this.sendSystemMessage(connection, '<span style="color: #3498DB">Usage: /promote [username] [host/admin]</span>');
                return false;
            }

            if(!target_id) {
                if(!silent) this.sendSystemMessage(connection, '<span style="color: #E74C3C"><b>User ' + target + ' not found.</b></span>');
                return false;
            }

            switch(arguments[2].toLowerCase()) {
                case "host":
                    var permission_list = permission.getPermissions(target_id, room.room.id);
                    if(permission_list && permission_list.indexOf(permission.PERMISSION_LEVEL_ROOM_HOST) > -1) {
                        this.sendSystemMessage(connection, '<span style="color: #E74C3C"><b>' + target + ' is already a host in this room.</b></span>');
                        return false;
                    }

                    permission.addPermission(target_id, {
                        "level": permission.PERMISSION_LEVEL_ROOM_HOST,
                        "scope": room.room.id
                    });
                break;
                case "admin":
                    var permission_list = permission.getPermissions(target_id, room.room.id);
                    if(!(permission.getEffectivePermissionLevel(id, room.room.id) <= permission.PERMISSION_LEVEL_ROOM_OWNER)) {
                        this.sendSystemMessage(connection, '<span style="color: #E74C3C"><b>Only the room owner can promote or demote admins.</b></span>');
                        return false;
                    }
                    if(permission_list && permission_list.indexOf(permission.PERMISSION_LEVEL_ROOM_ADMIN) > -1) {
                        this.sendSystemMessage(connection, '<span style="color: #E74C3C"><b>' + target + ' is already an admin in this room.</b></span>');
                        return false;
                    }

                    permission.addPermission(target_id, {
                        "level": permission.PERMISSION_LEVEL_ROOM_ADMIN,
                        "scope": room.room.id
                    });
                break;
                default:
                    this.sendSystemMessage(connection, '<span style="color: #3498DB">Usage: /promote [username] [host/admin]</span>');
                    return false;
            }

            room.sendSystemMessage('<span style="color: #9B59B6">' + chatkeys[key] + ' promoted ' + target + ' to ' + arguments[2].toLowerCase() + '.</span>');
            if(room.listeners[target_key]) {
                room.listeners[target_key].send(JSON.stringify({
                    event: "chat", data: '<span style="color: #3498DB">' + chatkeys[key] + ' promoted you to ' + arguments[2] + ' in this room. See /help for a list of commands.</span>'
                }));
            }
            break;
        case "/demote":
            if(arguments[2]) silent = true;
            if(!(permission.getEffectivePermissionLevel(id, room.room.id) <= permission.EFFECTIVE_PERMISSION_LEVEL_ADMIN)) {
                this.sendSystemMessage(connection, this.INSUFFICENT_PERMISSION);
                return false;
            }
            if(!target) {
                this.sendSystemMessage(connection, '<span style="color: #3498DB">Usage: /demote [username]</span>');
                return false;
            }

            if(!target_id) {
                this.sendSystemMessage(connection, '<span style="color: #E74C3C"><b>User ' + target + ' not found.</b></span>');
                return false;
            }

            if(permission.getEffectivePermissionLevel(target_id, room.room.id) == permission.PERMISSION_LEVEL_ROOM_ADMIN && permission.getEffectivePermissionLevel(id, room.room.id) != permission.PERMISSION_LEVEL_ROOM_OWNER) {
                this.sendSystemMessage(connection, '<span style="color: #E74C3C"><b>Only the room owner can promote or demote admins.</b></span>');
                return false;
            }

            room.sendSystemMessage('<span style="color: #9B59B6">' + chatkeys[key] + ' took admin privileges from ' + target + '.</span>');
            permission.removePermission(target_id, {
                "level": permission.PERMISSION_LEVEL_ROOM_ADMIN,
                "scope": room.room.id
            });

            if(permission.getEffectivePermissionLevel(target_id, room.room.id) == permission.PERMISSION_LEVEL_ROOM_HOST) {
                room.sendSystemMessage('<span style="color: #9B59B6">' + chatkeys[key] + ' took host privileges from ' + target + '.</span>');
                permission.removePermission(target_id, {
                    "level": permission.PERMISSION_LEVEL_ROOM_HOST,
                    "scope": room.room.id
                });
            }

            if(room.listeners[target_key]) {
                room.listeners[target_key].send(JSON.stringify({
                    event: "chat", data: '<span style="color: #3498DB">' + chatkeys[key] + ' removed your privileges in this room.</span>'
                }));
            }
            break;
        case "/syncbackgrounds":
            if(!(permission.getEffectivePermissionLevel(id, room.room.id) <= permission.EFFECTIVE_PERMISSION_LEVEL_ADMIN)) {
                this.sendSystemMessage(connection, this.INSUFFICENT_PERMISSION);
                return false;
            }
            room.syncBackgrounds();
        break;
        case "/setdesc":
            if(!(permission.getEffectivePermissionLevel(id, room.room.id) <= permission.EFFECTIVE_PERMISSION_LEVEL_ADMIN)) {
                this.sendSystemMessage(connection, this.INSUFFICENT_PERMISSION);
                return false;
            }
            var new_description = text.replace("/setdesc ", "");
            var database = db.getConnection();
            room.room.description = new_description;
            database.query("UPDATE `rooms` SET `description`=" + database.escape(new_description) + " WHERE `id`='" + room.room.id + "'");
            room.sendSystemMessage('<span style="color: #9B59B6">' + chatkeys[key] + ' updated the room description.</span>');
            for(var listener_id in room.listeners) {
                room.listeners[listener_id].send(JSON.stringify({
                    event: "desc_update", data: new_description
                }));
            }
            break;
        break;
		default:
			this.sendSystemMessage(connection, "Unknown command: " + arguments[0]);
	}
};