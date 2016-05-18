var fs = require("fs");

var commands = [];

for(var file_name of fs.readdirSync(__dirname + "/command/"))
	if(file_name.slice(-2) === "js")
		commands.push(new require(__dirname + "/command/" + file_name));

module.exports = {
	process: (connection, text, user, room) => {
		var arguments = text.split(" "),
			stub = arguments[0].substring(1);

		for(var command of commands)
			if(command.stub === stub)
				command.process(arguments, user, room);
	}
};