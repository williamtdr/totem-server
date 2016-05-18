"use strict";

module.exports = class Command {
	get INSUFFICENT_PERMISSION() {
		return '<span style="color: #E74C3C"><b>You don\'t have permission to use that command in this room.</b></span>';
	}

	sendSystemMessage(connection, message) {
		connection.send(JSON.stringify({
			event: "chat",
			data: {
				sender: "",
				message: message
			}
		}));
	}
};