import redis from 'redis';
import { promisify } from 'util';
import { Query } from './Query.mjs';
import { RoomData } from './RoomData.mjs';

class RedisDriver {
    _client;
    hgetall;
    constructor(options, key = 'roomcaches') {
        this._client = redis.createClient(options);
        this.hgetall = promisify(this._client.hgetall).bind(this._client);
    }
    createInstance(initialValues = {}) {
        return new RoomData(initialValues, this._client);
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
        return new Query(this.getRooms(), conditions);
    }
    async getRooms() {
        return Object.entries(await this.hgetall('roomcaches') ?? []).map(([, roomcache]) => new RoomData(JSON.parse(roomcache), this._client));
    }
    clear() {
        this._client.del('roomcaches');
    }
    shutdown() {
        this._client.quit();
    }
}

export { RedisDriver };
//# sourceMappingURL=index.mjs.map
