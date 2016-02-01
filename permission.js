module.exports.PERMISSION_LEVEL_ROOM_OWNER = 0;
module.exports.PERMISSION_LEVEL_ROOM_ADMIN = 1;
module.exports.PERMISSION_LEVEL_ROOM_HOST = 2;
module.exports.PERMISSION_LEVEL_ROOM_MUTED = 3;
module.exports.PERMISSION_LEVEL_ROOM_QUEUE_BANNED = 4;
module.exports.PERMISSION_LEVEL_ROOM_BANNED = 5;

module.exports.PERMISSION_LEVEL_SITE_ADMIN = 6;
module.exports.PERMISSION_LEVEL_SITE_MUTED = 7;
module.exports.PERMISSION_LEVEL_SITE_QUEUE_BANNED = 8;
module.exports.PERMISSION_LEVEL_SITE_BANNED = 9;

module.exports.EFFECTIVE_PERMISSION_LEVEL_OWNER = 0;
module.exports.EFFECTIVE_PERMISSION_LEVEL_ADMIN = 1;
module.exports.EFFECTIVE_PERMISSION_LEVEL_HOST = 2;
module.exports.EFFECTIVE_PERMISSION_LEVEL_MUTED = 3;
module.exports.EFFECTIVE_PERMISSION_LEVEL_QUEUE_BANNED = 4;
module.exports.EFFECTIVE_PERMISSION_LEVEL_BANNED = 5;
module.exports.EFFECTIVE_PERMISSION_LEVEL_NORMAL = 6;

permissions = [];

exports.reload = function(room_id, targets) {
	console.log("Reloading permission table for " + room_id + "...");
	for(var user_id in permissions) {
		for(var index in permissions[user_id]) {
			if(permissions[user_id][index].scope == room_id.toLowerCase) {
				delete permissions[user_id][index];
			}
		}
	}
	var database = db.getConnection();
	database.query('SELECT * FROM `permissions` WHERE `scope`=\'' + room_id.toLowerCase() + '\'', function (err, rows) {
		for(var row_id in rows) {
			var row = rows[row_id];
			if(!permissions[row.id]) {
				permissions[row.id] = [];
			}
			permissions[row.id].push({
				"level": row.level,
				"scope": row.scope.toLowerCase()
			});
		}
	});
	var check = [];
	if(targets) {
		check = targets;
	} else {
		if(awaiting_permission_load[room_id]) check = awaiting_permission_load[room_id];
	}
	for(var connection_wrapper_id in check) {
		var connection_wrapper = check[connection_wrapper_id],
			connection = connection_wrapper.connection,
			id = connection_wrapper.id;
		console.log(id);
		if(this.checkPermission(id, room_id.toLowerCase(), this.PERMISSION_LEVEL_ROOM_QUEUE_BANNED)) {
			connection.send(JSON.stringify({
				event: "permission", data: {type: "queue_ban_room"}
			}));
		}
		if(this.getEffectivePermissionLevel(id, room_id) <= this.EFFECTIVE_PERMISSION_LEVEL_ADMIN) {
			connection.send(JSON.stringify({
				event: "chat", data: {sender: "", message: '<span style="color: #2ECC71">Welcome! You have admin privileges in this room, check /help for a list of commands.</span>'}
			}));
			connection.send(JSON.stringify({
				event: "permission", data: {type: "room_admin"}
			}));
		}
		if(this.getEffectivePermissionLevel(id, room_id) == this.EFFECTIVE_PERMISSION_LEVEL_HOST) {
			connection.send(JSON.stringify({
				event: "chat", data: {sender: "", message: '<span style="color: #2ECC71">Welcome! You have moderation privileges in this room, check /help for a list of commands (see the Host section).</span>'}
			}));
			connection.send(JSON.stringify({
				event: "permission", data: {type: "room_host"}
			}));
		}
		if(this.checkPermission(id, room_id, this.PERMISSION_LEVEL_SITE_QUEUE_BANNED)) {
			connection.send(JSON.stringify({
				event: "permission", data: {type: "queue_ban_site"}
			}));
		}
		if(this.checkPermission(id, room_id, this.PERMISSION_LEVEL_ROOM_MUTED)) {
			connection.send(JSON.stringify({
				event: "permission", data: {type: "muted_room"}
			}));
		}
		if(this.checkPermission(id, room_id, this.PERMISSION_LEVEL_SITE_MUTED)) {
			connection.send(JSON.stringify({
				event: "permission", data: {type: "muted_site"}
			}));
		}
		if(this.checkPermission(id, room_id, this.PERMISSION_LEVEL_SITE_BANNED)) {
			connection.send(JSON.stringify({
				event: "permission", data: {type: "banned_site"}
			}));
		}
		if(this.checkPermission(id, room_id, this.PERMISSION_LEVEL_ROOM_BANNED)) {
			connection.send(JSON.stringify({
				event: "permission", data: {type: "banned_room"}
			}));
		}
		if(awaiting_permission_load[room_id]) delete awaiting_permission_load[room_id];
	}
};

exports.addPermission = function(key, permission) {
	var database = db.getConnection();
	if (!permissions[key]) {
		permissions[key] = [];
	}
	permissions[key].push(permission);
	database.query('INSERT IGNORE INTO `permissions` (`id`, `scope`, `level`) VALUES ("' + key + '", "' + permission.scope.toLowerCase() + '", "' + permission.level + '")');
};

exports.removePermission = function(key, permission) {
    var database = db.getConnection();
    permissions[key] = [];
    database.query("DELETE FROM `permissions` WHERE `id`='" + key + "' AND `scope`='" + permission.scope.toLowerCase() + "'");
};

exports.getPermissions = function(key, scope) {
	var results = [];
	if(permissions[key]) {
		for(var permission_id in permissions[key]) {
			if(permissions[key][permission_id].scope == scope.toLowerCase()) {
				results.push(permissions[key][permission_id].level);
			}
		}
	}

	if(results.length > 0) {
		return results;
	} else {
		return false;
	}
};

exports.checkPermission = function(id, scope, permission) {
	var full_list = this.getPermissions(id, scope.toLowerCase());
	if(!full_list) return false;
	return (full_list.indexOf(permission) > -1);
};

exports.getEffectivePermissionLevel = function(id, scope) {
	if(!scope) return this.EFFECTIVE_PERMISSION_LEVEL_NORMAL;
	var room_permissions = this.getPermissions(id, scope.toLowerCase());
	if(room_permissions) {
		if(room_permissions.indexOf(this.PERMISSION_LEVEL_ROOM_OWNER) > -1) return this.EFFECTIVE_PERMISSION_LEVEL_OWNER;
		if(room_permissions.indexOf(this.PERMISSION_LEVEL_ROOM_ADMIN) > -1) return this.EFFECTIVE_PERMISSION_LEVEL_ADMIN;
		if(room_permissions.indexOf(this.PERMISSION_LEVEL_ROOM_HOST) > -1) return this.EFFECTIVE_PERMISSION_LEVEL_HOST;
		if(room_permissions.indexOf(this.PERMISSION_LEVEL_ROOM_BANNED) > -1) return this.EFFECTIVE_PERMISSION_LEVEL_BANNED;
		if(room_permissions.indexOf(this.PERMISSION_LEVEL_ROOM_MUTED) > -1) return this.EFFECTIVE_PERMISSION_LEVEL_MUTED;
		if(room_permissions.indexOf(this.PERMISSION_LEVEL_ROOM_QUEUE_BANNED) > -1) return this.EFFECTIVE_PERMISSION_LEVEL_QUEUE_BANNED;
	}
	var global_permissions = this.getPermissions(id, "global");
	if(global_permissions) {
		if(global_permissions.indexOf(this.PERMISSION_LEVEL_SITE_ADMIN) > -1) return this.EFFECTIVE_PERMISSION_LEVEL_ADMIN;
		if(global_permissions.indexOf(this.PERMISSION_LEVEL_SITE_BANNED) > -1) return this.EFFECTIVE_PERMISSION_LEVEL_BANNED;
		if(global_permissions.indexOf(this.PERMISSION_LEVEL_SITE_MUTED) > -1) return this.EFFECTIVE_PERMISSION_LEVEL_MUTED;
		if(global_permissions.indexOf(this.PERMISSION_LEVEL_SITE_QUEUE_BANNED) > -1) return this.EFFECTIVE_PERMISSION_LEVEL_QUEUE_BANNED;
	}
    return this.EFFECTIVE_PERMISSION_LEVEL_NORMAL;
};