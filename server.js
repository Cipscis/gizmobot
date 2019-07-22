var fs = require('fs');
var Twit = require('twit');

const handle = '@GizmoSaysHello';
const match = /[😻🐈😹😸🐱😼😺😿😾😽🙀🦁🐯🐅]/g;

var app = {
	start: function () {
		app.init.readConfig();
		app.init.readLibrary();
	},

	init: {
		readConfig: function () {
			// config.json contains this app's API keys, which are secret
			fs.readFile('config.json', 'utf-8', app.init._onConfigRead);
		},

		_onConfigRead: function (err, data) {
			if (err) {
				console.error('ERROR: Failure to read config:', err);
				return;
			}

			var config = JSON.parse(data);

			app.T = new Twit(config);
			app.init._checkIsLoaded();
		},

		readLibrary: function () {
			// library.json contains information about all the possible tweets
			fs.readFile('library.json', 'utf-8', app.init._onLibraryRead);
		},

		_onLibraryRead: function (err, data) {
			if (err) {
				console.error('ERROR: Failure to read library:', err);
				return;
			}

			app.library = JSON.parse(data);
			app.init._checkIsLoaded();
		},

		_checkIsLoaded: function () {
			var isLoaded = app.T && app.library;

			if (isLoaded) {
				app.listen.start();
			}
		}
	},

	listen: {
		start: function () {
			console.log('I\'m listening!');

			var stream = app.T.stream('statuses/filter', { track: [handle] });

			stream.on('tweet', app.listen.read);
		},

		read: function (tweet) {
			var tweetText = (tweet.extended_tweet && tweet.extended_tweet.full_text) || tweet.text;

			console.log('');
			console.log(`I heard you, @${tweet.user.screen_name}. You said:`);
			console.log(tweetText);

			if (match.test(tweetText)) {
				console.log('I\'m going to reply.');
				app.reply.reply(tweet);
			} else {
				console.log('I won\'t reply.');
			}
		}
	},

	reply: {
		reply: function (tweet, reply) {
			var reply = reply || app.reply._generate(tweet);

			app.reply._uploadMedia(tweet, reply);
		},

		_generate: function (tweet) {
			var libraryTotal = app.library.replies.reduce((sum, reply, i) => sum + reply.chance, 0);
			var seed = Math.random() * libraryTotal;
			var reply;

			let progress = 0;
			for (let i = 0; i < app.library.replies.length; i++) {
				reply = app.library.replies[i];

				progress += reply.chance;
				if (progress > seed) {
					break;
				}
			}

			return reply;
		},

		_uploadMedia: function (tweet, reply) {
			var image = fs.readFileSync(`${app.library.path}/${reply.image}`, { encoding: 'base64' });

			app.T.post(
				'media/upload',
				{
					media_data: image
				},
				app.reply._createMediaMetadata(tweet, reply)
			);
		},

		_createMediaMetadata: function (tweet, reply) {
			return function (err, data, response) {
				var mediaIdStr = data.media_id_string;
				var altText = reply.alt;
				var meta_params = {
					media_id: mediaIdStr,
					alt_text: {
						text: altText
					}
				};

				app.T.post(
					'media/metadata/create',
					meta_params,
					app.reply._sendReply(tweet, reply, mediaIdStr)
				);
			};
		},

		_sendReply: function (tweet, reply, mediaIdStr) {
			return function (err, data, response) {
				if (!err) {
					var params = {
						status: `@${tweet.user.screen_name} ${reply.text}`,
						in_reply_to_status_id: tweet.id_str,
						media_ids: [mediaIdStr]
					};

					app.T.post('statuses/update', params, function (err, data, response) {
						console.log(`I replied successfully to @${tweet.user.screen_name}:`);
						console.log(reply);
					});
				}
			};
		}
	}
};

app.start();
