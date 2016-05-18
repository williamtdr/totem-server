/*
 * Useful utilities not available or clumsy in pure JS
 */

module.exports = {
	replaceAt: (input, index, character) => input.substr(0, index) + character + input.substr(index + character.length),
	randomInt: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
	randomString: (length) => {
		var text = "",
			possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

		for(var i = 0; i < ((length - 1) || 20); i++)
			text += possible.charAt(Math.floor(Math.random() * possible.length));

		return text;
	},
	removeEl: (array, what) => {
		var index = array.indexOf(what);

		if(index > -1)
			array.splice(index, 1);
	},
	getNextAddedAt: (data) => {
		var highest_added_at = 0;

		if(data.length > 0) {
			for(var index in data) {
				var item = data[index],
					time = (item.added_at + item.duration);

				if(time > highest_added_at)
					highest_added_at = time;
			}

			return highest_added_at;
		} else
			return Math.floor(Date.now() / 1000);
	}
};