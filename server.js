var fs = require('fs');
var Twit = require('twit');

var app = {
	init: function () {
		app._readConfig(app._start);
	},

	_readConfig: function (callback) {
		// config.json contains this app's API keys, which are secret
		fs.readFile('config.json', 'utf-8', app._onConfigRead(callback));
	},

	_onConfigRead: function (callback) {
		return function (err, data) {
			if (err) {
				console.error('ERROR: Failure to launch app:', err);
				return;
			}

			var config = JSON.parse(data);
			callback(config);
		};
	},

	_start: function (config) {
		var T = new Twit(config);

		// Now I can start doing things!
		console.log(T);
	}
};

app.init();
