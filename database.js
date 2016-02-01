var colors = require('colors'),
	mysql = require('mysql'),
	retry = require('retry'),
	config = require('./config.js'),
	dbConnection = false;

var createConnection = function (callback) {
	dbConnection = mysql.createConnection(config.DB);
	dbConnection.connect(function (er) {
	    if(er) {
            console.log(er);
            callback(er);
	    } else {
	    	callback(false);
	    }
	});

	dbConnection.on('error', function (err) {
		if(err.fatal) {
            retryConnection(false);
		}
	});
};


var getConnection = function () {
	return dbConnection;
};

var retryConnection = function (initial, cb) {
    console.log("[System] ".blue + "Connecting to MySQL server...".white);

    var operation = retry.operation();
    operation.attempt(function (currentAttempt) {
        dbConnection = false;
        createConnection(function (err1) {
            if(err1) {
                if(!initial) console.log("[System] ".blue + ("Database connection failed, try " + currentAttempt).white);
                if(operation.retry(err1)) {
                    return;
                }
            } else {
                if(!initial) console.log("[System] ".blue + ("Database reconnected.").white);
            }

            if(cb) {
                cb(err1 ? operation.mainError() : null, dbConnection);
            }
        });
    });
};

module.exports = {
	connect : retryConnection,
	getConnection: getConnection
};