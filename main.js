import Promise from 'bluebird';

import consoleStamp from 'console-stamp';
import { docopt } from 'docopt';
import fs from 'fs';
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import _ from 'lodash';
import rp from 'request-promise';

import * as lib from './lib';

import config from './config.json';

Promise.config({
  warnings: true,
  longStackTraces: true,
  cancellation: true,
});

consoleStamp(console, {
  pattern: 'HH:MM:ss',
  colors: {
    stamp: 'gray',
    label: 'gray',
  },
});

const doc = `
Usage:
  main serve
  main status (all | <id>...)
  main restart (all | <id>...)
  main clean (all | <id>...)
`;

const argv = docopt(doc);

const outputFile = 'output.txt';

if (!argv.serve) {
  (async () => {
    const ids = argv.all ?
      config.servers :
      _.intersection(config.servers, argv['<id>']);

    console.log(`${ids.length} servers: ${JSON.stringify(ids, null, 2)}`);
    console.log('Processing...');

    let output;
    if (argv.status) {
      output = await lib.status(ids);
    } else if (argv.restart) {
      output = await lib.restart(ids);
    } else if (argv.clean) {
      output = await lib.clean(ids);
    }

    if (output) {
      fs.writeFileSync(outputFile, output);
      console.log(`Done! Check ${outputFile}`);
    } else {
      fs.unlinkSync(outputFile);
      console.log('Done! No output');
    }

    process.exit(0);
  })();
}

const app = new Koa();
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    console.error(err.message);
    throw err;
  }
});
app.use(bodyParser());

app.use(async (ctx) => {
  console.log(ctx.request.header['x-real-ip']);

  const { method, url } = ctx.request;
  if (method !== 'POST' || url !== '/') {
    console.log({ method, url });
    ctx.throw(404, 'bad method or url');
  }

  const {
    token, team_id, channel_id, user_id, user_name,
    text, response_url,
  } = ctx.request.body;
  if (
    token !== config.slack.token ||
    team_id !== config.slack.team_id || // eslint-disable-line
    channel_id !== config.slack.channel_id // eslint-disable-line
  ) {
    console.log({ token, team_id, channel_id, user_id });
    ctx.throw(401, 'bad token, team_id or channel_id');
  }

  console.log(`${user_name}: /srv ${text}`); // eslint-disable-line

  if (!text) {
    ctx.body = `\`\`\`
Usage:
  /srv                          show usage
  /srv status (all | <id>...)   print status
  /srv restart (all | <id>...)  force restart
  /srv clean (all | <id>...)    reset configs, restart if empty and print status
\`\`\``;
    return;
  }

  const [action, ...rawIds] = text.split(' ');

  if (!rawIds.length) ctx.throw(400, 'not enough arguments');
  const ids = rawIds[0] === 'all' ?
    config.servers :
    _.intersection(config.servers, rawIds);

  console.log(`servers: ${ids.join(' ')}`);

  let p;
  if (action === 'status') {
    p = lib.status(ids);
  } else if (action === 'restart') {
    p = lib.restart(ids);
  } else if (action === 'clean') {
    p = lib.clean(ids);
  } else {
    ctx.throw(400, 'bad action');
  }

  p.then((x) => {
    rp({
      method: 'POST',
      url: response_url,
      body: {
        response_type: 'in_channel',
        text: `*Done!*\`\`\`${x}\`\`\``,
      },
      json: true,
    });
    console.log('done');
  }).catch((err) => {
    rp({
      method: 'POST',
      url: response_url,
      body: {
        response_type: 'in_channel',
        text: `*Error!*\`\`\`${err}\`\`\``,
      },
      json: true,
    });
    console.error(err);
  });

  ctx.body = {
    response_type: 'in_channel',
    text: `Working on it... Selected servers: \`${ids.join(' ')}\``,
  };
});

app.listen(80);
