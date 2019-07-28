const dotenv = require('dotenv');
const express = require('express');
const fs = require('fs');
const http = require('http');
const Twit = require('twit');

dotenv.config();

const server = express();
server.set('port', process.env.PORT || 5000);


const handle = process.env.HANDLE || 'GizmoSaysHello';
const emoji = ['😻', '🐈', '😹', '😸', '🐱', '😼', '😺', '😿', '😾', '😽', '🙀', '🦁', '🐯', '🐅'];

const app = {
	start: function () {
		console.log('Starting bot...');

		app.init.initTwit();
		app.init.readLibrary();

		if (process.env.ENVIRONMENT === 'heroku') {
			// Ping the Heroku app every 5 minutes
			setInterval(app.listen.keepAwake, 1000*60*5);
		}
	},

	init: {
		initTwit: function (err, data) {
			app.T = new Twit({
				consumer_key: process.env.CONSUMER_KEY,
				consumer_secret: process.env.CONSUMER_SECRET,
				access_token: process.env.ACCESS_TOKEN,
				access_token_secret: process.env.ACCESS_TOKEN_SECRET
			});
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

			app.library = app.init._validateLibrary(data);

			app.init._checkIsLoaded();
		},

		_validateLibrary: function (library) {
			let valid = true;
			let errors = [];

			try {
				library = JSON.parse(library);

				for (let i = 0; i < library.replies.length; i++) {
					let reply = library.replies[i];
					let replyValid = app.init._validateReply(reply);

					if (replyValid === false) {
						errors.push(`Reply ${i} is not valid`);
					}

					valid = valid && replyValid;
				}

				if (valid === true) {
					console.log('Successfully validated library');
					return library;
				}
			} catch (e) {
				valid = false;
			}

			if (valid === false) {
				console.error('Error validating library:', errors);
			}
		},

		_validateReply: function (reply) {
			let valid;

			valid = typeof reply.image === 'string' &&
			        typeof reply.alt === 'string' &&
			        typeof reply.text === 'string' &&
			        typeof reply.chance === 'number';

			return valid;
		},

		_checkIsLoaded: function () {
			let isLoaded = app.T && app.library;

			if (isLoaded) {
				app.listen.start();
			}
		}
	},

	listen: {
		start: function () {
			console.log('I\'m listening!');

			let stream = app.T.stream('statuses/filter', { track: [handle] });

			stream.on('tweet', app.listen.read);
		},

		read: function (tweet) {
			let tweetText = (tweet.extended_tweet && tweet.extended_tweet.full_text) || tweet.text;

			if (tweet.user.screen_name.toLowerCase() === handle.toLowerCase()) {
				return;
			}

			console.log('');
			console.log(`I heard you, @${tweet.user.screen_name}. You said:`);
			console.log(tweetText);

			let match = false;
			for (let i = 0; i < emoji.length; i++) {
				if (tweetText.indexOf(emoji[i]) !== -1) {
					match = true;
					break;
				}
			}

			if (match) {
				console.log('I\'m going to reply.');
				app.reply.reply(tweet);
			} else {
				console.log('I won\'t reply.');
			}
		},

		keepAwake: function () {
			console.log('');
			console.log('Keeping awake');
			http.get('http://gizmo-bot.herokuapp.com/');
		}
	},

	reply: {
		reply: function (tweet, reply) {
			reply = reply || app.reply._generate(tweet);

			app.reply._uploadMedia(tweet, reply);
		},

		_generate: function (tweet) {
			let libraryTotal = app.library.replies.reduce((sum, reply, i) => sum + reply.chance, 0);
			let seed = Math.random() * libraryTotal;
			let reply;

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
			let image = fs.readFileSync(`${app.library.path}/${reply.image}`, { encoding: 'base64' });

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
				let mediaIdStr = data.media_id_string;
				let altText = reply.alt;
				let meta_params = {
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
					let params = {
						status: `@${tweet.user.screen_name} ${reply.text}`,
						in_reply_to_status_id: tweet.id_str,
						media_ids: [mediaIdStr]
					};

					app.T.post('statuses/update', params, function (err, data, response) {
						if (err) {
							console.error('I tried to reply, but there was an error:');
							console.error(err);
						} else {
							console.log(`I replied successfully to @${tweet.user.screen_name}:`);
							console.log(reply);
						}
					});
				}
			};
		}
	}
};

server.listen(server.get('port'), app.start);
