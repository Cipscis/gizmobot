const dotenv = require('dotenv');
const express = require('express');
const fs = require('fs');
const http = require('http');
const Twit = require('twit');

dotenv.config();

const server = express();
server.set('port', process.env.PORT || 5000);


const handle = process.env.HANDLE || 'GizmoSaysHello';
const postFrequency = (process.env.POST_FREQUENCY || 1) * 60 * 1000; // minutes -> milliseconds
const emoji = ['😻', '🐈', '😹', '😸', '🐱', '😼', '😺', '😿', '😾', '😽', '🙀', '🦁', '🐯', '🐅'];

let postTimeout;

const maxFileSize = 5242880;

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
					let replyValid = app.init._validateEntry(reply, library);

					if (replyValid === false) {
						errors.push(`Reply ${i} is not valid`);
					}

					valid = valid && replyValid;
				}

				for (let i = 0; i < library.posts.length; i++) {
					let post = library.posts[i];
					let postValid = app.init._validateEntry(post, library);

					if (postValid === false) {
						errors.push(`Post ${i} is not valid`);
					}

					valid = valid && postValid;
				}

				if (valid === true) {
					console.log('Successfully validated library');
					return library;
				}
			} catch (e) {
				console.error(e);
				valid = false;
			}

			if (valid === false) {
				console.error(`${errors.length} error${errors.length !== 1 ? 's' : ''} validating library:`, errors);
			}
		},

		_validateEntry: function (entry, library) {
			let validTypes = typeof entry.image === 'string'
			        typeof entry.text === 'string' &&
			        typeof entry.chance === 'number';

			let image = library.images[entry.image];
			let validImage = typeof image !== 'undefined' &&
			                 typeof image.file === 'string' &&
			                 typeof image.alt === 'string';

			let valid = validTypes && validImage;

			if (valid !== true) {
				console.error(`Invalid entry: ${JSON.stringify(entry, null, '\t')}`);
			}

			return valid;
		},

		_checkIsLoaded: function () {
			let isLoaded = app.T && app.library;

			if (isLoaded) {
				app.listen.toReply();
				app.listen.toPost();
			}
		}
	},

	listen: {
		toReply: function () {
			console.log('I\'m listening!');

			let stream = app.T.stream('statuses/filter', { track: [handle] });

			stream.on('tweet', app.listen._read);
		},

		toPost: function () {
			console.log('I\'m ready to post!');

			if (typeof postTimeout !== 'undefined') {
				clearTimeout(postTimeout);
				postTimeout = undefined;
			}

			// postTimeout = setTimeout(app.listen._post, postFrequency);
			// Post immediately when the app starts
			app.listen._post();
		},

		_post: function () {
			app.tweet.post();

			postTimeout = setTimeout(app.tweet.post, postFrequency);
		},

		_read: function (tweet) {
			let tweetText = (tweet.extended_tweet && tweet.extended_tweet.full_text) || tweet.text;
			console.log('');

			if (tweet.user.screen_name.toLowerCase() === handle.toLowerCase()) {
				console.log(`I heard you, @${tweet.user.screen_name}, but that's me so I'm going to ignore it.`);
				return;
			}

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
				app.tweet.reply(tweet);
			} else {
				console.log('I won\'t reply.');
			}
		},

		keepAwake: function () {
			console.log('Keeping awake');
			http.get('http://gizmo-bot.herokuapp.com/');
		}
	},

	tweet: {
		reply: function (tweet, reply) {
			reply = reply || app.tweet._generate(app.library.replies);

			app.tweet._uploadMedia(reply, tweet);
		},

		post: function (post) {
			post = post || app.tweet._generate(app.library.posts);

			app.tweet._uploadMedia(post);
		},

		_generate: function (library) {
			library = library || app.library.replies;

			let libraryTotal = library.reduce((sum, reply, i) => sum + reply.chance, 0);
			let seed = Math.random() * libraryTotal;
			let reply;

			let progress = 0;
			for (let i = 0; i < library.length; i++) {
				reply = library[i];

				progress += reply.chance;
				if (progress > seed) {
					break;
				}
			}

			return reply;
		},

		_uploadMedia: function (tweet, replyingToTweet) {
			let image = app.library.images[tweet.image];
			let imageFile = fs.readFileSync(`${app.library.path}/${image.file}`, { encoding: 'base64' });

			app.T.post(
				'media/upload',
				{
					media_data: imageFile
				},
				app.tweet._createMediaMetadata(tweet, replyingToTweet)
			);
		},

		_createMediaMetadata: function (tweet, replyingToTweet) {
			return function (err, data, response) {
				let image = app.library.images[tweet.image];

				let mediaIdStr = data.media_id_string;
				let altText = image.alt;
				let meta_params = {
					media_id: mediaIdStr,
					alt_text: {
						text: altText
					}
				};

				app.T.post(
					'media/metadata/create',
					meta_params,
					app.tweet._sendTweet(tweet, mediaIdStr, replyingToTweet)
				);
			};
		},

		_sendTweet: function (tweet, mediaIdStr, replyingToTweet) {
			return function (err, data, response) {
				if (!err) {
					let params = {
						status: `${tweet.text}`,
						media_ids: [mediaIdStr]
					};

					if (typeof replyingToTweet !== 'undefined') {
						status = `@${replyingToTweet.user.screen_name} ${status}`;
						params['in_reply_to_status_id'] = replyingToTweet.id_str;
					}

					app.T.post('statuses/update', params, function (err, data, response) {
						if (err) {
							console.error('I tried to tweet, but there was an error:');
							if (typeof replyingToTweet !== 'undefined') {
								console.error(`I was trying to reply to ${replyingToTweet.user.screen_name}`);
							}
							console.error(err);
						} else {
							if (typeof replyingToTweet !== 'undefined') {
								console.log(`I replied successfully to @${replyingToTweet.user.screen_name}:`);
								console.log(tweet);
							} else {
								console.log(`I successfully posted a tweet:`);
								console.log(tweet);
							}
						}
					});
				} else {
					console.error('I tried to tweet, but there was an error creating metadata:');
					console.error(err);
				}
			};
		}
	}
};

server.listen(server.get('port'), app.start);
