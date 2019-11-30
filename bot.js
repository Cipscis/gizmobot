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
const maxFileSize = 5242880;


// Times to post
const postTimes = [
	{
		hours: 9,
		minutes: 30
	},
	{
		hours: 16,
		minutes: 30
	}
];

// Poll every 7 minutes by defuault to add a little noise to when the posts are sent
const postIntervalLength = 1000 * 60 * (parseFloat(process.env.POST_INTERVAL_LENGTH) || 7);
let postInterval;
let nextPostTime;

// Remember recent posts and replies to avoid repeats
const memoryDuration = parseInt(process.env.MEMORY_DURATION, 10) || 1;
let postMemory = [];
let replyMemory = [];

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

			nextPostTime = app.listen._getNextPostTime();
			postInterval = setInterval(app.listen._checkShouldPost, postIntervalLength);
		},

		_getNextPostTime: function () {
			let now = new Date();

			let nextTime;
			let nextTimeObj;
			postTimes.forEach(timeObj => {
				let time = new Date(now);
				time.setHours(timeObj.hours);
				time.setMinutes(timeObj.minutes);
				time.setSeconds(0);

				// If this time has passed today, set it to tomorrow
				// Using < to check doesn't work sometimes, for some reason,
				// so use a custom check instead
				if (app.listen._isTimePassed(time)) {
					time.setDate(time.getDate()+1);
				}

				if (typeof nextTime === 'undefined') {
					nextTime = time;
					nextTimeObj = timeObj;
				} else if (app.listen._isTimePassed(time, nextTime)) {
					nextTime = time;
					nextTimeObj = timeObj;
				}
			});

			console.log('Next post time:', nextTimeObj);

			return nextTime;
		},

		_isTimePassed: function (timeToCheck, now) {
			now = now || new Date();

			let isPassed = false;

			let timeToCheckObj = app.listen._getDateTimeObj(timeToCheck);
			let nowObj = app.listen._getDateTimeObj(now);

			if (timeToCheckObj.year < nowObj.year) {
				isPassed = true;
			} else if (timeToCheckObj.year === nowObj.year) {
				if (timeToCheckObj.month < nowObj.month) {
					isPassed = true;
				} else if (timeToCheckObj.month === nowObj.month) {
					if (timeToCheckObj.date < nowObj.date) {
						isPassed = true;
					} else if (timeToCheckObj.date === nowObj.date) {
						if (timeToCheckObj.hours < nowObj.hours) {
							isPassed = true;
						} else if (timeToCheckObj.hours === nowObj.hours) {
							if (timeToCheckObj.minutes <= nowObj.minutes) {
								// Mark it as passed if in the same minute
								isPassed = true;
							}
						}
					}
				}
			}

			return isPassed;
		},

		_getDateTimeObj: function (dateTime) {
			let dateTimeObj = {
				year: dateTime.getFullYear(),
				month: dateTime.getMonth(),
				date: dateTime.getDate(),

				hours: dateTime.getHours(),
				minutes: dateTime.getMinutes(),
			};

			return dateTimeObj;
		},

		_checkShouldPost: function () {
			console.log('Checking if I should post...');

			let now = new Date();

			if (app.listen._isTimePassed(nextPostTime)) {
				console.log('Posting');
				nextPostTime = app.listen._getNextPostTime();
				app.tweet.post();
			} else {
				console.log('It\'s not time to post yet');
			}
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
			reply = reply || app.tweet._generate(app.library.replies, replyMemory);
			app.tweet._remember(reply, replyMemory);

			app.tweet._uploadMedia(reply, tweet);
		},

		post: function (post) {
			post = post || app.tweet._generate(app.library.posts, postMemory);
			app.tweet._remember(post, postMemory);

			app.tweet._uploadMedia(post);
		},

		_generate: function (library, memory) {
			library = library || app.library.replies;
			memory = memory || replyMemory;

			let libraryTotal = library.reduce((sum, reply, i) => sum + reply.chance, 0);
			let seed = Math.random() * libraryTotal;
			let message;

			let progress = 0;
			for (let i = 0; i < library.length; i++) {
				message = library[i];

				progress += message.chance;
				if (progress > seed) {
					break;
				}
			}

			// If this message was used recently, regenerate it
			if (memory.indexOf(message) !== -1) {
				message = app.tweet._generate(library, memory);
			}

			return message;
		},

		_remember: function (message, memory) {
			memory = memory || replyMemory;

			memory.push(message);

			let length = memory.length;
			while (length > memoryDuration) {
				// Remove the first element
				memory.splice(0, 1);
			}
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
						params.status = `@${replyingToTweet.user.screen_name} ${params.status}`;
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
