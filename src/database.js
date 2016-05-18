var colors = require("colors"),
	mysql = require("mysql"),
	retry = require("retry"),
	dbConnection = false;

var createConnection = (callback) => {
	var config = global.user_config.get("database");
	config.supportBigNumbers = true;

	dbConnection = mysql.createConnection(config);
	dbConnection.connect((er) => {
	    if(er) {
			console.log(er);
			callback(er);
	    } else
	    	callback(false);
	});

	dbConnection.on("error", (err) => {
		if(err.fatal)
			process.exit(); // restart
	});
};

var retryConnection = (initial, cb) => {
    console.log("[System] ".blue + "Connecting to MySQL server...".white);

    var operation = retry.operation();
    operation.attempt(function(currentAttempt) {
        dbConnection = false;
        createConnection((err1) => {
            if(err1) {
                if(!initial)
					console.log("[System] ".blue + ("Database connection failed, try " + currentAttempt).white);

                if(operation.retry(err1))
                    return;
            } else
                if(!initial)
					console.log("[System] ".blue + ("Database reconnected.").white);

			module.exports.connection = dbConnection;

            cb();
        });
    });
};

module.exports = {
	connect: retryConnection,
	connection: dbConnection
};