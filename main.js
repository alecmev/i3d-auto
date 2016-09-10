import Promise from 'bluebird';

import Table from 'cli-table';
import consoleStamp from 'console-stamp';
import { docopt } from 'docopt';
import generatePassword from 'password-generator';
import rp from 'request-promise';

import config from './config.json';

Promise.config({
  warnings: true,
  longStackTraces: true,
  cancellation: true,
});

consoleStamp(console, {
  pattern: 'HH:MM:ss',
  label: false,
  include: ['error', 'warn', 'info'],
  colors: {
    stamp: 'gray',
    label: 'gray',
  },
});

const cities = {
  ams: 'Amsterdam',
  fra: 'Frankfurt',
  gru: 'Sao Paulo',
  iad: 'Washington',
  mia: 'Miami',
};

const allIds = [
  702210,
  702211,
  702212,
  702213,
  702214,
  702215,
  702216,
  702217,
  702218,
  702219,
];

async function callAPI(action, gameserverId, body = {}) {
  console.error(`[${gameserverId}] ${action}`);
  const r = await rp({
    method: 'POST',
    url: 'https://customer.i3d.net/api/rest/v2/gameserver',
    body: {
      ...config,
      action,
      gameserverId,
      ...body,
    },
    json: true,
  });
  if (r.status === 'Success') return r;
  throw new Error(`[${gameserverId}] ${action} failed: ${r.msg}`);
}

async function status(ids = allIds) {
  const t = new Table({
    head: [
      'id', 'location',
      'ip', 'rcon port', 'rcon password', 'game password',
      'state', 'players',
      'last online',
      'current name',
    ],
  });
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

  console.log(t.toString());
}

async function restart(ids = allIds) {
  for (const id of ids) {
    await callAPI('hardRestart', id, { seconds: 1 });
  }
}

async function clean(ids = allIds) {
  const locNums = {};
  for (const id of ids) {
    const srv = (await callAPI('getServerById', id)).data.gameservers[0];
    const locName = cities[srv.location] || srv.location.toUpperCase();
    const locNum = (locNums[srv.location] || 0) + 1;
    locNums[srv.location] = locNum;
    const name = `BCL | auzom.gg | i3D.net | ${locName} ${locNum}`;
    await callAPI('updateConfig', id, {
      gameconfigName: 'startup.txt',
      gameconfig: new Buffer(`
vars.preset normal false
vars.serverType private

admin.password ${generatePassword(16, false)}
vars.gamePassword ${generatePassword(4)}
vars.serverDescription "https://auzom.gg/battlefield-4/conquest-league"
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
//     await callAPI('updateConfig', id, {
//       gameconfigName: 'spectatorList.txt',
//       gameconfig: new Buffer(`
// _Drtyyyyyy
// ACX-jevs
// auzom-Mr_Falls
// Auzom_Aether
// BOOMBABY-Geruled
// BrettFXTV
// ESF-John3I6
// eXo-MrElectrify
// InFamouS_Scorpi
// Jonnnne
// Kevinario
// LDLC_NeomeTrixX
// LHC_UneFrite
// MiloshTheMedic
// nerdRage_Alby26
// nerdRage_Santa
// NeutralCitizen
// oO_Slax
// RSA-VEGA
// Skrub_Panda
// Skrublord_Gump
// TaffsX
// uRaN-MiiT
// WAFFELS-Cobalt
//       `).toString('base64'),
//     });
    // await callAPI('updateConfig', id, {
    //   gameconfigName: 'maplist.txt',
    //   gameconfig: new Buffer(
    //     'MP_Abandoned ConquestSmall0 1'
    //   ).toString('base64'),
    // });
    await callAPI('updateConfig', id, {
      gameconfigName: 'ReservedSlotsList.txt',
      gameconfig: new Buffer(
        ''
      ).toString('base64'),
    });
    if (srv.livePlayers === 0) {
      await callAPI('hardRestart', id, { seconds: 1 });
    } else {
      console.info(`[${id}] no restart, ${srv.livePlayers} players online`);
    }
  }
}

const argv = docopt(`
Usage:
  main status [<id>...]
  main restart [<id>...]
  main clean [<id>...]
`);

const argIds = argv['<id>'].length ? argv['<id>'] : undefined;
if (argv.status) {
  status(argIds);
} else if (argv.restart) {
  restart(argIds);
} else if (argv.clean) {
  clean(argIds);
}
