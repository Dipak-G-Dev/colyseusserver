import { Server, Room } from "@colyseus/core";
import { Client } from "colyseus.js";
import * as httpie from "httpie";
export declare class ColyseusTestServer {
    server: Server;
    sdk: {
        joinOrCreate: Client['joinOrCreate'];
        join: Client['join'];
        create: Client['create'];
        joinById: Client['joinById'];
        reconnect: Client['reconnect'];
    };
    http: {
        get: typeof httpie.get;
        post: typeof httpie.post;
        patch: typeof httpie.patch;
        delete: typeof httpie.del;
        put: typeof httpie.put;
    };
    constructor(server: Server);
    createRoom<State = any, Metadata = any>(roomName: string, clientOptions?: any): Promise<Room<State, Metadata>>;
    connectTo<T>(room: Room<T>, clientOptions?: any): Promise<import("colyseus.js").Room<T>>;
    getRoomById<State = any, Metadata = any>(roomId: string): Room<State, Metadata>;
    cleanup(): Promise<void>;
    shutdown(): Promise<void>;
}
