import { ErrorCode } from './Protocol.mjs';
import { subscribeIPC, requestFromIPC } from './IPC.mjs';
import { retry, REMOTE_ROOM_SHORT_TIMEOUT, generateId, merge } from './Utils.mjs';
import { RegisteredHandler } from './matchmaker/RegisteredHandler.mjs';
import { RoomInternalState } from './Room.mjs';
import { LocalPresence } from './presence/LocalPresence.mjs';
import { debugAndPrintError, debugMatchMaking } from './Debug.mjs';
import { SeatReservationError } from './errors/SeatReservationError.mjs';
import { ServerError } from './errors/ServerError.mjs';
import { LocalDriver } from './matchmaker/driver/index.mjs';
import * as controller from './matchmaker/controller.mjs';
export { controller };

const handlers = {};
const rooms = {};
let processId;
let presence;
let driver;
let isGracefullyShuttingDown;
function setup(_presence, _driver, _processId) {
    presence = _presence || new LocalPresence();
    driver = _driver || new LocalDriver();
    processId = _processId;
    isGracefullyShuttingDown = false;
    /**
     * Subscribe to remote `handleCreateRoom` calls.
     */
    subscribeIPC(presence, processId, getProcessChannel(), (_, args) => {
        return handleCreateRoom.apply(undefined, args);
    });
    presence.hset(getRoomCountKey(), processId, '0');
}
/**
 * Join or create into a room and return seat reservation
 */
async function joinOrCreate(roomName, clientOptions = {}) {
    return await retry(async () => {
        let room = await findOneRoomAvailable(roomName, clientOptions);
        if (!room) {
            room = await createRoom(roomName, clientOptions);
        }
        return await reserveSeatFor(room, clientOptions);
    }, 5, [SeatReservationError]);
}
/**
 * Create a room and return seat reservation
 */
async function create(roomName, clientOptions = {}) {
    const room = await createRoom(roomName, clientOptions);
    return reserveSeatFor(room, clientOptions);
}
/**
 * Join a room and return seat reservation
 */
async function join(roomName, clientOptions = {}) {
    return await retry(async () => {
        const room = await findOneRoomAvailable(roomName, clientOptions);
        if (!room) {
            throw new ServerError(ErrorCode.MATCHMAKE_INVALID_CRITERIA, `no rooms found with provided criteria`);
        }
        return reserveSeatFor(room, clientOptions);
    });
}
/**
 * Join a room by id and return seat reservation
 */
async function joinById(roomId, clientOptions = {}) {
    const room = await driver.findOne({ roomId });
    if (room) {
        const rejoinSessionId = clientOptions.sessionId;
        if (rejoinSessionId) {
            // handle re-connection!
            const hasReservedSeat = await remoteRoomCall(room.roomId, 'hasReservedSeat', [rejoinSessionId]);
            if (hasReservedSeat) {
                return { room, sessionId: rejoinSessionId };
            }
            else {
                throw new ServerError(ErrorCode.MATCHMAKE_EXPIRED, `session expired: ${rejoinSessionId}`);
            }
        }
        else if (!room.locked) {
            return reserveSeatFor(room, clientOptions);
        }
        else {
            throw new ServerError(ErrorCode.MATCHMAKE_INVALID_ROOM_ID, `room "${roomId}" is locked`);
        }
    }
    else {
        throw new ServerError(ErrorCode.MATCHMAKE_INVALID_ROOM_ID, `room "${roomId}" not found`);
    }
}
/**
 * Perform a query for all cached rooms
 */
async function query(conditions = {}) {
    return await driver.find(conditions);
}
/**
 * Find for a public and unlocked room available
 */
async function findOneRoomAvailable(roomName, clientOptions) {
    return await awaitRoomAvailable(roomName, async () => {
        const handler = handlers[roomName];
        if (!handler) {
            throw new ServerError(ErrorCode.MATCHMAKE_NO_HANDLER, `provided room name "${roomName}" not defined`);
        }
        const roomQuery = driver.findOne({
            locked: false,
            name: roomName,
            private: false,
            ...handler.getFilterOptions(clientOptions),
        });
        if (handler.sortOptions) {
            roomQuery.sort(handler.sortOptions);
        }
        return await roomQuery;
    });
}
/**
 * Call a method or return a property on a remote room.
 */
async function remoteRoomCall(roomId, method, args, rejectionTimeout = REMOTE_ROOM_SHORT_TIMEOUT) {
    const room = rooms[roomId];
    if (!room) {
        try {
            return await requestFromIPC(presence, getRoomChannel(roomId), method, args);
        }
        catch (e) {
            const request = `${method}${args && ' with args ' + JSON.stringify(args) || ''}`;
            throw new ServerError(ErrorCode.MATCHMAKE_UNHANDLED, `remote room (${roomId}) timed out, requesting "${request}". (${rejectionTimeout}ms exceeded)`);
        }
    }
    else {
        return (!args && typeof (room[method]) !== 'function')
            ? room[method]
            : (await room[method].apply(room, args));
    }
}
function defineRoomType(name, klass, defaultOptions) {
    const registeredHandler = new RegisteredHandler(klass, defaultOptions);
    handlers[name] = registeredHandler;
    cleanupStaleRooms(name);
    return registeredHandler;
}
function removeRoomType(name) {
    delete handlers[name];
    cleanupStaleRooms(name);
}
function hasHandler(name) {
    return handlers[name] !== undefined;
}
/**
 * Create a room
 */
async function createRoom(roomName, clientOptions) {
    const roomsSpawnedByProcessId = await presence.hgetall(getRoomCountKey());
    const processIdWithFewerRooms = (Object.keys(roomsSpawnedByProcessId).sort((p1, p2) => {
        return (Number(roomsSpawnedByProcessId[p1]) > Number(roomsSpawnedByProcessId[p2]))
            ? 1
            : -1;
    })[0]) || processId;
    if (processIdWithFewerRooms === processId) {
        // create the room on this process!
        return await handleCreateRoom(roomName, clientOptions);
    }
    else {
        // ask other process to create the room!
        let room;
        try {
            room = await requestFromIPC(presence, getProcessChannel(processIdWithFewerRooms), undefined, [roomName, clientOptions], REMOTE_ROOM_SHORT_TIMEOUT);
        }
        catch (e) {
            // if other process failed to respond, create the room on this process
            debugAndPrintError(e);
            room = await handleCreateRoom(roomName, clientOptions);
        }
        return room;
    }
}
async function handleCreateRoom(roomName, clientOptions) {
    const registeredHandler = handlers[roomName];
    if (!registeredHandler) {
        throw new ServerError(ErrorCode.MATCHMAKE_NO_HANDLER, `provided room name "${roomName}" not defined`);
    }
    const room = new registeredHandler.klass();
    // set room public attributes
    room.roomId = generateId();
    room.roomName = roomName;
    room.presence = presence;
    // create a RoomCache reference.
    room.listing = driver.createInstance({
        name: roomName,
        processId,
        ...registeredHandler.getFilterOptions(clientOptions),
    });
    if (room.onCreate) {
        try {
            await room.onCreate(merge({}, clientOptions, registeredHandler.options));
            // increment amount of rooms this process is handling
            presence.hincrby(getRoomCountKey(), processId, 1);
        }
        catch (e) {
            debugAndPrintError(e);
            throw new ServerError(e.code || ErrorCode.MATCHMAKE_UNHANDLED, e.message);
        }
    }
    room.internalState = RoomInternalState.CREATED;
    room.listing.roomId = room.roomId;
    room.listing.maxClients = room.maxClients;
    // imediatelly ask client to join the room
    debugMatchMaking('spawning \'%s\', roomId: %s, processId: %s', roomName, room.roomId, processId);
    room._events.on('lock', lockRoom.bind(this, room));
    room._events.on('unlock', unlockRoom.bind(this, room));
    room._events.on('join', onClientJoinRoom.bind(this, room));
    room._events.on('leave', onClientLeaveRoom.bind(this, room));
    room._events.once('dispose', disposeRoom.bind(this, roomName, room));
    room._events.once('disconnect', () => room._events.removeAllListeners());
    // room always start unlocked
    await createRoomReferences(room, true);
    await room.listing.save();
    registeredHandler.emit('create', room);
    return room.listing;
}
function getRoomById(roomId) {
    return rooms[roomId];
}
/**
 * Disconnects every client on every room in the current process.
 */
function disconnectAll() {
    const promises = [];
    for (const roomId in rooms) {
        if (!rooms.hasOwnProperty(roomId)) {
            continue;
        }
        promises.push(rooms[roomId].disconnect());
    }
    return promises;
}
function gracefullyShutdown() {
    if (isGracefullyShuttingDown) {
        return Promise.reject('already_shutting_down');
    }
    isGracefullyShuttingDown = true;
    debugMatchMaking(`${processId} is shutting down!`);
    // remove processId from room count key
    presence.hdel(getRoomCountKey(), processId);
    // unsubscribe from process id channel
    presence.unsubscribe(getProcessChannel());
    return Promise.all(disconnectAll());
}
/**
 * Reserve a seat for a client in a room
 */
async function reserveSeatFor(room, options) {
    const sessionId = generateId();
    debugMatchMaking('reserving seat. sessionId: \'%s\', roomId: \'%s\', processId: \'%s\'', sessionId, room.roomId, processId);
    let successfulSeatReservation;
    try {
        successfulSeatReservation = await remoteRoomCall(room.roomId, '_reserveSeat', [sessionId, options]);
    }
    catch (e) {
        debugMatchMaking(e);
        successfulSeatReservation = false;
    }
    if (!successfulSeatReservation) {
        throw new SeatReservationError(`${room.roomId} is already full.`);
    }
    return { room, sessionId };
}
async function cleanupStaleRooms(roomName) {
    //
    // clean-up possibly stale room ids
    // (ungraceful shutdowns using Redis can result on stale room ids still on memory.)
    //
    const cachedRooms = await driver.find({ name: roomName }, { _id: 1 });
    // remove connecting counts
    await presence.del(getHandlerConcurrencyKey(roomName));
    await Promise.all(cachedRooms.map(async (room) => {
        try {
            // use hardcoded short timeout for cleaning up stale rooms.
            await remoteRoomCall(room.roomId, 'roomId');
        }
        catch (e) {
            debugMatchMaking(`cleaning up stale room '${roomName}', roomId: ${room.roomId}`);
            room.remove();
        }
    }));
}
async function createRoomReferences(room, init = false) {
    rooms[room.roomId] = room;
    if (init) {
        await subscribeIPC(presence, processId, getRoomChannel(room.roomId), (method, args) => {
            return (!args && typeof (room[method]) !== 'function')
                ? room[method]
                : room[method].apply(room, args);
        });
    }
    return true;
}
async function awaitRoomAvailable(roomToJoin, callback) {
    return new Promise(async (resolve, reject) => {
        const concurrencyKey = getHandlerConcurrencyKey(roomToJoin);
        const concurrency = await presence.incr(concurrencyKey) - 1;
        // avoid having too long timeout if 10+ clients ask to join at the same time
        const concurrencyTimeout = Math.min(concurrency * 100, REMOTE_ROOM_SHORT_TIMEOUT);
        if (concurrency > 0) {
            debugMatchMaking('receiving %d concurrent requests for joining \'%s\' (waiting %d ms)', concurrency, roomToJoin, concurrencyTimeout);
        }
        setTimeout(async () => {
            try {
                const result = await callback();
                resolve(result);
            }
            catch (e) {
                reject(e);
            }
            finally {
                await presence.decr(concurrencyKey);
            }
        }, concurrencyTimeout);
    });
}
function onClientJoinRoom(room, client) {
    handlers[room.roomName].emit('join', room, client);
}
function onClientLeaveRoom(room, client, willDispose) {
    handlers[room.roomName].emit('leave', room, client, willDispose);
}
function lockRoom(room) {
    // emit public event on registered handler
    handlers[room.roomName].emit('lock', room);
}
async function unlockRoom(room) {
    if (await createRoomReferences(room)) {
        // emit public event on registered handler
        handlers[room.roomName].emit('unlock', room);
    }
}
async function disposeRoom(roomName, room) {
    debugMatchMaking('disposing \'%s\' (%s) on processId \'%s\'', roomName, room.roomId, processId);
    // decrease amount of rooms this process is handling
    if (!isGracefullyShuttingDown) {
        presence.hincrby(getRoomCountKey(), processId, -1);
    }
    // remove from room listing (already removed if `disconnect()` has been called)
    if (room.internalState !== RoomInternalState.DISCONNECTING) {
        await room.listing.remove();
    }
    // emit disposal on registered session handler
    handlers[roomName].emit('dispose', room);
    // remove concurrency key
    presence.del(getHandlerConcurrencyKey(roomName));
    // unsubscribe from remote connections
    presence.unsubscribe(getRoomChannel(room.roomId));
    // remove actual room reference
    delete rooms[room.roomId];
}
//
// Presence keys
//
function getRoomChannel(roomId) {
    return `$${roomId}`;
}
function getHandlerConcurrencyKey(name) {
    return `c:${name}`;
}
function getProcessChannel(id = processId) {
    return `p:${id}`;
}
function getRoomCountKey() {
    return 'roomcount';
}

export { create, createRoom, defineRoomType, disconnectAll, driver, findOneRoomAvailable, getRoomById, gracefullyShutdown, hasHandler, join, joinById, joinOrCreate, presence, processId, query, remoteRoomCall, removeRoomType, reserveSeatFor, setup };
//# sourceMappingURL=MatchMaker.mjs.map
