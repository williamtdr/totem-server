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
	removeA: (arr) => {
		var what, a = arguments, L = a.length, ax;
		while (L > 1 && arr.length) {
			what = a[--L];
			while ((ax = arr.indexOf(what)) !== -1) {
				arr.splice(ax, 1);
			}
		}
		return arr;
	}
};