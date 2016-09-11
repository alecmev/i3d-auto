import Table from 'cli-table';
import generatePassword from 'password-generator';
import rp from 'request-promise';

import config from './config.json';

const cities = {
  ams: 'Amsterdam',
  fra: 'Frankfurt',
  gru: 'Sao Paulo',
  iad: 'Washington',
  mia: 'Miami',
};

async function callAPI(action, gameserverId, body = {}) {
  console.log(`[${gameserverId}] ${action}`);
  const r = await rp({
    method: 'POST',
    url: 'https://customer.i3d.net/api/rest/v2/gameserver',
    body: {
      ...config.i3d,
      action,
      gameserverId,
      ...body,
    },
    json: true,
  });
  if (r.status === 'Success') return r;
  throw new Error(`[${gameserverId}] ${action} failed: ${r.msg}`);
}

const tableOptions = {
  head: [
    'id', 'location',
    'ip', 'rcon port', 'rcon password', 'game password',
    'state', 'players',
    'last online',
    'current name',
  ],
  style: {
    head: [],
    border: [],
  },
  chars: {
    top: '',
    'top-mid': '',
    'top-left': '',
    'top-right': '',
    bottom: '',
    'bottom-mid': '',
    'bottom-left': '',
    'bottom-right': '',
    left: '',
    'left-mid': '',
    mid: '',
    'mid-mid': '',
    right: '',
    'right-mid': '',
    middle: '│',
  },
};

export async function status(ids) {
  const t = new Table(tableOptions);
  const locNums = {};
  for (const id of ids) {
    // requests are made sequentially to avoid hitting the rate-limiter
    const [srv, cfg] = [
      (await callAPI('getServerById', id)).data.gameservers[0],
      (await callAPI('getConfig', id, { gameconfigName: 'startup.txt' }))
        .data[0].config.gameconfig,
    ];

    const locNum = (locNums[srv.location] || 0) + 1;
    locNums[srv.location] = locNum;
    const cfgL = cfg.split('\n');
    const pwa = cfgL.find((x) => x.startsWith('admin.password'));
    const pwg = cfgL.find((x) => x.startsWith('vars.gamePassword'));
    const online = srv.online === 1;

    t.push([
      id, `${cities[srv.location] || srv.location.toUpperCase()} ${locNum}`,
      srv.ip, srv.queryPort, pwa && pwa.split(' ')[1], pwg && pwg.split(' ')[1],
      (online ? 'ON' : 'OFF'), srv.livePlayers,
      (online ? '' : (new Date(srv.lastOnline * 1000)).toISOString()),
      srv.HostName,
    ]);
  }

  return t.toString();
}

export async function restart(ids) {
  for (const id of ids) {
    await callAPI('hardRestart', id, { seconds: 1 });
  }
}

export async function clean(ids) {
  const t = new Table(tableOptions);
  const locNums = {};
  for (const id of ids) {
    const srv = (await callAPI('getServerById', id)).data.gameservers[0];

    const locName = cities[srv.location] || srv.location.toUpperCase();
    const locNum = (locNums[srv.location] || 0) + 1;
    locNums[srv.location] = locNum;
    const name = `${config.name.pre}${locName} ${locNum}${config.name.post}`;
    const pwa = generatePassword(16, false, /[A-Za-z0-9]/);
    const pwg = generatePassword(4);
    const online = srv.online === 1;

    t.push([
      id, `${locName} ${locNum}`,
      srv.ip, srv.queryPort, pwa, pwg,
      (online ? 'ON' : 'OFF'), srv.livePlayers,
      (online ? '' : (new Date(srv.lastOnline * 1000)).toISOString()),
      name,
    ]);

    await callAPI('updateConfig', id, {
      gameconfigName: 'startup.txt',
      gameconfig: new Buffer(`
vars.preset normal false
vars.serverType private

admin.password ${pwa}
vars.gamePassword ${pwg}
vars.serverDescription "${config.desc}"
vars.serverMessage "${name}"
vars.serverName "${name}"

punkBuster.activate
vars.alwaysAllowSpectators false
vars.autoBalance false
vars.commander false
vars.friendlyFire true
vars.gameModeCounter 63
vars.idleTimeout 0
vars.killCam false
vars.maxPlayers 18
vars.maxSpectators 8
vars.roundLockdownCountdown 30
vars.roundPlayersReadyBypassTimer 900
vars.roundPlayersReadyMinCount 0
vars.roundPlayersReadyPercent 50
vars.roundRestartPlayerCount 0
vars.roundStartPlayerCount 0
vars.roundTimeLimit 50
vars.teamKillCountForKick 0
vars.teamKillKickForBan 0
vars.teamKillValueForKick 0
vars.unlockMode all
vars.OutHighFrequency 60
      `).toString('base64'),
    });

    await callAPI('updateConfig', id, {
      gameconfigName: 'spectatorList.txt',
      gameconfig: new Buffer(config.spectators.join('\n')).toString('base64'),
    });

    await callAPI('updateConfig', id, {
      gameconfigName: 'maplist.txt',
      gameconfig: new Buffer(config.maps.join('\n')).toString('base64'),
    });

    await callAPI('updateConfig', id, {
      gameconfigName: 'ReservedSlotsList.txt',
      gameconfig: new Buffer(config.reserved.join('\n')).toString('base64'),
    });

    if (srv.livePlayers === 0) {
      await callAPI('hardRestart', id, { seconds: 1 });
    } else {
      console.log(`[${id}] no restart, ${srv.livePlayers} players online`);
    }
  }

  return t.toString();
}
