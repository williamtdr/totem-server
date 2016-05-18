"use strict";

module.exports = class User {
	constructor() {
		this.connection = false;
		this.room = false;
		this.id = -1;
		this.key = "";
		this.name = "";
		this.guest = false;
		this.profile = false;
	}

	sendChatMessage(sender, message, color, hoverColor) {
		color = color || "#2ECC71";
		hoverColor = hoverColor || "#27AE60";

		if(this.connection)
			this.connection.send(JSON.stringify({
				event: "chat",
				data: {
					sender: sender,
					message: message,
					color: color,
					hover_color: hoverColor
				}
			}));
	}

	send(message) {
		if(this.connection)
			this.connection.send(JSON.stringify(message));
	}
};