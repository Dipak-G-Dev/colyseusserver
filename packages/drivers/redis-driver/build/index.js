'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

var redis = require('redis');
var util = require('util');
var Query = require('./Query.js');
var RoomData = require('./RoomData.js');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

var redis__default = /*#__PURE__*/_interopDefaultLegacy(redis);

class RedisDriver {
    _client;
    hgetall;
    constructor(options, key = 'roomcaches') {
        this._client = redis__default['default'].createClient(options);
        this.hgetall = util.promisify(this._client.hgetall).bind(this._client);
    }
    createInstance(initialValues = {}) {
        return new RoomData.RoomData(initialValues, this._client);
    }
    async find(conditions) {
        const rooms = await this.getRooms();
        return rooms.filter((room) => {
            if (!room.roomId) {
                return false;
            }
            for (const field in conditions) {
                if (conditions.hasOwnProperty(field) &&
                    room[field] !== conditions[field]) {
                    return false;
                }
            }
            return true;
        });
    }
    findOne(conditions) {
        return new Query.Query(this.getRooms(), conditions);
    }
    async getRooms() {
        return Object.entries(await this.hgetall('roomcaches') ?? []).map(([, roomcache]) => new RoomData.RoomData(JSON.parse(roomcache), this._client));
    }
    clear() {
        this._client.del('roomcaches');
    }
    shutdown() {
        this._client.quit();
    }
}

exports.RedisDriver = RedisDriver;
//# sourceMappingURL=index.js.map
