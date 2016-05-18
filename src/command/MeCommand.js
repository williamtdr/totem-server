"use strict";

var Command = require("../class/Command");

module.exports = class MeCommand extends Command {
	constructor() {
		this.stub = "me";
	}

	process(args, source, room) {
		room.sendChatMessage("*" + source.name, args.join(" ", true));
	}
};