var Song = require('./Song.js');
var Score = require('./Score.js');

function Room(id, display_name) {
    this.id = id;
    this.display_name = display_name;
    this.description = "";
    this.song = false;
    this.score = new Score();
    this.current_dj = "";

    this.chat_history = [];
    this.listeners_by_name = [];
    this.backgrounds = false;
    this.listener_count = 0;
	this.icon = "http://static.totem.fm/default_notification.png";
}

module.exports = Room;