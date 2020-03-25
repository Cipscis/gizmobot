# gizmobot
A Twitter bot for tweeting photos and gifs, running on node. It's named gizmobot after my cat Gizmo. See https://twitter.com/gizmosayshello for a working implementation.

Gizmobot can reply to tweets mentioning it that contain certain "signal" strings, and make automated posts at specified times. It pulls from a library of images and messages configured in a JSON file.

## Setup

Before your bot can tweet, you need to first create a Twitter account for it, and then gain access to the Twitter API. To do this, you'll need to create an app for your bot in Twitter's Developer website: https://developer.twitter.com/en/apps

Once this is set up, you will need to set some environmental variables. See the **Configuration** section for more information on this.

You can run the bot on your computer by running `npm start` in a command prompt in the project folder. You will need to have Node installed: https://nodejs.org/en/download/

However, you may not want to run the bot this way once it is ready to go live, because it would stop running if your computer turns off. @GizmoSaysHello runs as a Heroku app, which you can set up for free: https://www.heroku.com/

If you set up a gizmobot app to run on Heroku, remember to set the `HEROKU_APP` environment variable so the bot will ping itself regularly to keep itself awake, otherwise Heroku may turn it off if it's inactive for too long.

## Configuration

Most configuration variables are set as environment variables. When running the project locally, these are contained in a file called `.env`

Some other, more complex configuration variables are configured in the code. These are configured in a file called `.env`

The content of the messages that the bot can tweet are configured in a file called `library.json`

### Environment variables

`CONSUMER_KEY` *required*

`CONSUMER_SECRET` *required*

`ACCESS_TOKEN` *required*

`ACCESS_TOKEN_SECRET` *required*

These four environment variables are necessary to use the Twitter API. You can generate them when you create an app in Twitter's Developers site: https://developer.twitter.com/en/apps

`ENVIRONMENT` *optional*

If set to `"heroku"`, and the `HEROKU_APP` environment variable is also set, the Twitter bot will ping the Heroku app with the given name every 5 minutes to prevent it from going to sleep.

`HEROKU_APP` *optional*

The name of the Heroku app, if the bot is running in that environment. See `ENVIRONMENT`.

`HANDLE` *required*
The handle of the Twitter account that the bot will be tweeting from. Do not include the @ symbol. For example, `"GizmoSaysHello"`

`POST_INTERVAL_LENGTH` *optional* Default: 7

The number of minutes the bot should wait between checking if it's time to post a new tweet. Set to 1 to tweet at the exact times specified. The default is 7 to provide a little variance in when the tweets are sent.

`MEMORY_DURATION` *optional* Default: 1

The number of posts and replies to remember, in order to avoid repetition. Relies on the `MEMORY_POSTS_ID` and `MEMORY_REPLIES_ID` environment variables to function. If the memory duration is larger than the size of the library, it will be ignored.

### Complex configuration variables

`signals`

An array of strings, which are each potential signals to trigger a reply.

`postTimes`

An array of objects, where each object contains an `hours` integer from 0 to 23 and a `minutes` integer from 0 to 59 representing a time the bot should make a post.

Because the bot polls regularly to see if one of these times have passed, the post will always come some amount of time after the time specified here.

### Library

The `library.json` file contains a JSON object with four properties:

#### `path`

The path to the folder containing images. I recommending leaving this as the default "images", and putting the images in the images folder in the root of the project.

#### `images`

This is an object containing a number of image objects. The key for each image object is referred to elsewhere in the library. Each image object requires two properties:

`file`

The filename of the image.

`alt`

The "alt" text describing the images, used by assistive technology such as screen readers.

#### `replies`

This is an array of objects specifying the replies that the bot can pull from. Each reply is an object containing the following properties:

`image`

The key of the image to embed in this reply.

`text`

The text of the reply.

`change` *optional* Default: 10

An integer configuring how likely this reply is to be chosen. Higher numbers are more likely to be chosen.

#### `posts`

This is an array of objects specifying the posts that the bot can pull from. Its structure is the same as `replies`.
