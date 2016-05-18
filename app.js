var colors = require("colors"),
	request = require("request"),
	WebSocketServer = require("websocket").server,
	htmlencode = require("htmlencode"),
	http = require("http");

var Config = require("./src/config"),
	database = require("./src/database"),
	RoomManager = require("./src/RoomManager"),
	UserManager = require("./src/UserManager"),
	server = require("./src/server");

var clients = [];

var wsServer,
	webServer;

var onWsMessage = (request) => {
	if(request.requestedProtocols.indexOf("echo-protocol") === -1) {
		console.log("[System] ".blue + "Rejecting a connection because of an incorrect protocol.");
		request.reject();
		return;
	} else
		var connection = request.accept("echo-protocol", request.origin);

	var index = clients.push(connection) - 1;

	try {
		connection.on("message", (message) => {
			if(message.type === "utf8") {
				try {
					var data = JSON.parse(message.utf8Data);
				} catch(e) {
					return console.log("Invalid JSON: " + message.utf8Data);
				}

				if(typeof data.key !== "string")
					return false;

				UserManager.login((user) => {
					if(!user)
						return false;

					RoomManager.get((room) => {
						if(!room)
							return user.send({
								event: "room_data",
								data: false
							});
						
						server(room, user, data);
					}, data.room || user.room);
				}, data.key, connection);
			}
		});

		connection.on("close", () => {
			var user = UserManager.getByConnection(connection);
			if(!RoomManager.disconnect(connection) && user)
				console.log("[User] ".yellow + ("Guest from " + user.room + " disconnected.").white);

			if(user && user.key && user.key.substring(0, 6) !== "guest")
				UserManager.revokeKey(user.key);

			clients.splice(index, 1);
		});
	} catch(e) {
		console.log("[System] ".blue + e);
	}
};

var bind = () => {
	webServer = http.createServer(function (request, response) {
		response.writeHead(302, {
			"Location": "http://totem.fm"
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

	wsServer.on("request", onWsMessage);
};

var next = (result) => {
	if(!result) {
		console.log("There was an error reading the Totem configuration file (config/config.json).");
		console.log("Please make sure the file exists, has the proper permissions and valid JSON.");
		console.log("If you'd like to start over, copy config.sample.json.");
		return process.exit(1);
	}

	console.log("[System] ".blue + "Establishing database connection...".white);

	database.connect(true, () => {
		database.connection.query("UPDATE `rooms` SET `user_counter`=0,`song_name`=null,`song_artist`=null,`song_started_at`=0,`song_url_fragment`=null,`song_source`=0,`song_picture_url`=null");

		console.log("[System] ".blue + "Starting web server...".white);

		bind();

		setInterval(RoomManager.tick, 100);
	});
};

console.log("[System] ".blue + "Loading configuration...".white);
global.user_config = new Config("config/config.json", next);